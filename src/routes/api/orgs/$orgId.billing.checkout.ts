import { createFileRoute } from '@tanstack/react-router'
import { eq, and, isNull } from 'drizzle-orm'
import { db } from '~/lib/db'
import { orgs, users } from '~/lib/schema'
import { auditLog, generateId } from '~/lib/db-utils'
import { requireAuth, errorResponse, jsonError } from '~/lib/auth'
import { requireOrgRole, ORG_ROLE_OWNER, ORG_ROLE_ADMIN } from '~/lib/rbac'
import { isBillingEnabled, createCustomer, createTeamCheckoutSession } from '~/lib/stripe'
import { getOrgSubscription, billableSeats, countOrgMembers } from '~/lib/plans'
import { billingSubscriptions } from '~/lib/schema'

// Starts the Team upgrade: creates (or reuses) the org's Stripe customer and
// opens a Checkout Session for the per-seat Team price. The actual plan flip
// happens in the webhook on checkout.session.completed - this route only
// hands back the hosted checkout URL.
export const Route = createFileRoute('/api/orgs/$orgId/billing/checkout')({
  server: {
    handlers: {
      POST: async ({ request, params }) => {
        try {
          const { user } = await requireAuth(request)
          const orgId = await requireOrgRole(params, user.id, [ORG_ROLE_OWNER, ORG_ROLE_ADMIN])
          if (!isBillingEnabled()) throw jsonError('Billing is not configured on this server', 503)

          const orgRows = await db.select().from(orgs)
            .where(and(eq(orgs.id, orgId), isNull(orgs.deleted_at)))
            .limit(1)
          const org = orgRows[0] ?? null
          if (!org) throw jsonError('Org not found', 404)
          if (org.kind === 'personal') {
            throw jsonError('Personal organizations are on the free Personal plan. Create a shared organization to use Team.', 400)
          }

          let sub = await getOrgSubscription(orgId)
          if (sub?.stripe_subscription_id && sub.status !== 'canceled') {
            throw jsonError('This organization already has a subscription - manage it from the billing portal instead', 409)
          }

          const ownerRows = await db.select({ email: users.email }).from(users)
            .where(eq(users.id, org.owner_user_id))
            .limit(1)
          const ownerEmail = ownerRows[0]?.email ?? user.email

          // The customer row persists across cancellations so a re-subscribe
          // reuses the saved payment method.
          if (!sub) {
            const customer = await createCustomer(orgId, org.name, ownerEmail)
            await db.insert(billingSubscriptions).values({
              id: generateId(),
              org_id: orgId,
              stripe_customer_id: customer.id,
            })
            sub = await getOrgSubscription(orgId)
            if (!sub) throw jsonError('Failed to initialize billing', 500)
          }

          const seats = billableSeats(await countOrgMembers(orgId))
          const baseUrl = process.env.APP_URL ?? new URL(request.url).origin
          const session = await createTeamCheckoutSession({
            customerId: sub.stripe_customer_id,
            orgId,
            seats,
            successUrl: `${baseUrl}/dashboard/${orgId}/settings?billing=success`,
            cancelUrl: `${baseUrl}/dashboard/${orgId}/settings?billing=canceled`,
          })
          if (!session.url) throw jsonError('Stripe did not return a checkout URL', 502)

          await auditLog({ orgId, actorUserId: user.id, action: 'billing.checkout', targetType: 'org', targetId: orgId, metadata: { seats } })
          return Response.json({ url: session.url }, { status: 200 })
        } catch (err) {
          return errorResponse(err)
        }
      },
    },
  },
})
