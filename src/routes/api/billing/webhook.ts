import { createFileRoute } from '@tanstack/react-router'
import { z } from 'zod'
import { eq } from 'drizzle-orm'
import { db } from '~/lib/db'
import { orgs, users, billingSubscriptions, billingEvents } from '~/lib/schema'
import { auditLog, generateId } from '~/lib/db-utils'
import { errorResponse } from '~/lib/auth'
import { verifyWebhookSignature, getSubscription } from '~/lib/stripe'
import { isPaidStatus } from '~/lib/plans'
import { sendPaymentFailedEmail } from '~/lib/email'

const eventSchema = z.object({
  id: z.string(),
  type: z.string(),
  data: z.object({ object: z.record(z.string(), z.unknown()) }),
})

// Shape the webhook works against - normalized because Stripe moved
// current_period_end from the subscription onto its line items in the
// 2025-04 API revision, and either shape can arrive.
interface SubscriptionSnapshot {
  id: string
  status: string
  seats: number
  periodEnd: Date | null
  cancelAtPeriodEnd: boolean
}

// Stripe events for the billing lifecycle. Unauthenticated (Stripe calls it)
// and gated instead by the Stripe-Signature HMAC over the raw body. Delivery
// is at-least-once: billing_events makes every event idempotent.
export const Route = createFileRoute('/api/billing/webhook')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const secret = process.env.STRIPE_WEBHOOK_SECRET
          if (!secret) return Response.json({ error: 'Webhook is not configured' }, { status: 503 })

          const rawBody = await request.text()
          const valid = await verifyWebhookSignature(rawBody, request.headers.get('stripe-signature'), secret)
          if (!valid) return Response.json({ error: 'Invalid signature' }, { status: 400 })

          const event = eventSchema.parse(JSON.parse(rawBody))

          // Replay guard: insert before handling; a unique conflict means this
          // delivery is a duplicate and handling it again could double-apply
          // side effects (emails, plan flips).
          const inserted = await db.insert(billingEvents)
            .values({ id: event.id, type: event.type })
            .onConflictDoNothing()
            .returning({ id: billingEvents.id })
          if (inserted.length === 0) return Response.json({ received: true, duplicate: true }, { status: 200 })

          await handleBillingEvent(event.id, event.type, event.data.object)
          return Response.json({ received: true }, { status: 200 })
        } catch (err) {
          return errorResponse(err)
        }
      },
    },
  },
})

async function handleBillingEvent(eventId: string, type: string, object: Record<string, unknown>): Promise<void> {
  switch (type) {
    case 'checkout.session.completed': {
      if (object.mode !== 'subscription') return
      const session = z.object({
        customer: z.string(),
        subscription: z.string(),
        metadata: z.record(z.string(), z.string()).optional(),
      }).parse(object)
      const orgId = session.metadata?.org_id ?? null
      if (!orgId) {
        console.error(`[billing] checkout.session.completed ${eventId} without org metadata`)
        return
      }
      // Pull the full subscription so seats/period match Stripe exactly,
      // whatever fields this API version inlines into the session payload.
      const sub = await getSubscription(session.subscription)
      await applySubscription(orgId, session.customer, snapshotOf(sub), eventId)
      return
    }

    case 'customer.subscription.created':
    case 'customer.subscription.updated':
    case 'customer.subscription.deleted': {
      const subSchema = z.object({
        id: z.string(),
        customer: z.string(),
        status: z.string(),
        cancel_at_period_end: z.boolean().nullish(),
        current_period_end: z.number().nullish(),
        items: z.object({ data: z.array(z.object({
          quantity: z.number().nullish(),
          current_period_end: z.number().nullish(),
        })) }).nullish(),
        metadata: z.record(z.string(), z.string()).nullish(),
      })
      const parsed = subSchema.safeParse(object)
      if (!parsed.success) return
      const sub = parsed.data
      const orgId = await orgIdForCustomer(sub.customer, sub.metadata?.org_id)
      if (!orgId) return

      if (type === 'customer.subscription.deleted') {
        // Keep the customer row - a later re-subscribe reuses the saved
        // payment method. Clear only the subscription state; plan -> free.
        await db.update(billingSubscriptions).set({
          stripe_subscription_id: null,
          status: 'canceled',
          cancel_at_period_end: false,
          current_period_end: null,
          updated_at: new Date(),
        }).where(eq(billingSubscriptions.org_id, orgId))
        await setOrgPlan(orgId, 'free', eventId)
        return
      }

      const qty = sub.items?.data?.[0]?.quantity
      await applySubscription(orgId, sub.customer, {
        id: sub.id,
        status: sub.status,
        seats: typeof qty === 'number' && qty > 0 ? qty : 1,
        periodEnd: epochToDate(sub.current_period_end ?? sub.items?.data?.[0]?.current_period_end),
        cancelAtPeriodEnd: sub.cancel_at_period_end ?? false,
      }, eventId)
      return
    }

    case 'invoice.payment_failed': {
      const parsed = z.object({ customer: z.string() }).safeParse(object)
      if (!parsed.success) return
      const orgId = await orgIdForCustomer(parsed.data.customer, null)
      if (!orgId) return
      await db.update(billingSubscriptions).set({ status: 'past_due', updated_at: new Date() })
        .where(eq(billingSubscriptions.org_id, orgId))
      const owner = await orgOwner(orgId)
      if (owner) {
        await sendPaymentFailedEmail({ to: owner.email, orgName: owner.orgName })
      }
      return
    }

    default:
      // Unhandled event types are not errors - Stripe delivers whatever the
      // endpoint is configured for; we only care about the ones above.
      return
  }
}

function epochToDate(epoch: number | null | undefined): Date | null {
  return typeof epoch === 'number' ? new Date(epoch * 1000) : null
}

function snapshotOf(sub: {
  id: string
  status: string
  cancel_at_period_end?: boolean | undefined
  current_period_end?: number | undefined
  items?: { data?: { quantity?: number | undefined; current_period_end?: number | undefined }[] | undefined } | undefined
}): SubscriptionSnapshot {
  const qty = sub.items?.data?.[0]?.quantity
  return {
    id: sub.id,
    status: sub.status,
    seats: typeof qty === 'number' && qty > 0 ? qty : 1,
    periodEnd: epochToDate(sub.current_period_end ?? sub.items?.data?.[0]?.current_period_end),
    cancelAtPeriodEnd: sub.cancel_at_period_end ?? false,
  }
}

// applySubscription is the single place webhook payloads turn into local
// state: billing_subscriptions row sync + the org's plan flip.
async function applySubscription(orgId: string, customerId: string, sub: SubscriptionSnapshot, eventId: string): Promise<void> {
  const updated = await db.update(billingSubscriptions).set({
    stripe_customer_id: customerId,
    stripe_subscription_id: sub.id,
    status: sub.status,
    seat_count: sub.seats,
    current_period_end: sub.periodEnd,
    cancel_at_period_end: sub.cancelAtPeriodEnd,
    updated_at: new Date(),
  }).where(eq(billingSubscriptions.org_id, orgId))
    .returning({ id: billingSubscriptions.id })

  if (updated.length === 0) {
    // No checkout-initiated row for this org (e.g. subscription created from
    // the Stripe dashboard) - create one; org_id is unique so concurrent
    // webhook deliveries still collapse to a single row.
    await db.insert(billingSubscriptions).values({
      id: generateId(),
      org_id: orgId,
      stripe_customer_id: customerId,
      stripe_subscription_id: sub.id,
      status: sub.status,
      seat_count: sub.seats,
      current_period_end: sub.periodEnd,
      cancel_at_period_end: sub.cancelAtPeriodEnd,
    }).onConflictDoNothing()
  }

  const plan = isPaidStatus(sub.status) ? 'team' : 'free'
  await setOrgPlan(orgId, plan, eventId)
  await auditLog({ orgId, actorUserId: null, action: `billing.subscription.${sub.status}`, targetType: 'org', targetId: orgId, metadata: { eventId, seats: sub.seats } })
}

async function setOrgPlan(orgId: string, plan: string, eventId: string): Promise<void> {
  await db.update(orgs).set({ plan }).where(eq(orgs.id, orgId))
  console.log(`[billing] org ${orgId} plan -> ${plan} (event ${eventId})`)
}

// Find the org a Stripe object belongs to: metadata first (set at checkout
// time on both the session and the subscription), then the locally stored
// customer mapping.
async function orgIdForCustomer(customerId: string, metadataOrgId: string | null | undefined): Promise<string | null> {
  if (metadataOrgId) return metadataOrgId
  const rows = await db.select({ org_id: billingSubscriptions.org_id }).from(billingSubscriptions)
    .where(eq(billingSubscriptions.stripe_customer_id, customerId))
    .limit(1)
  const orgId = rows[0]?.org_id ?? null
  if (!orgId) console.error(`[billing] no org mapped for Stripe customer ${customerId}`)
  return orgId
}

async function orgOwner(orgId: string): Promise<{ email: string; orgName: string } | null> {
  const rows = await db.select({ email: users.email, orgName: orgs.name })
    .from(orgs)
    .innerJoin(users, eq(users.id, orgs.owner_user_id))
    .where(eq(orgs.id, orgId))
    .limit(1)
  return rows[0] ?? null
}
