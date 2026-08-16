import { eq, and, isNull, count } from 'drizzle-orm'
import { db } from './db'
import { orgs, orgMembers, projects, billingSubscriptions } from './schema'
import type { BillingSubscription } from './schema'
import { HttpError } from './auth'
import { isBillingEnabled, getSubscription, updateSubscriptionQuantity, cancelSubscription, subscriptionSeats } from './stripe'
import { FREE_MAX_PROJECTS, TEAM_MAX_PROJECTS, TEAM_SEAT_MONTHLY_USD } from './plans-shared'

// Plans and their limits. The orgs.plan column is the source of truth for
// enforcement; billing_subscriptions holds the Stripe state behind 'team'.
// Personal orgs are always on the free plan (pricing: Personal $0, single
// user); Team is per-org per-seat billing on shared orgs.
export const PLAN_FREE = 'free'
export const PLAN_TEAM = 'team'

export interface PlanLimits {
  maxProjects: number
  collaboration: boolean
}

export const PLAN_LIMITS: Record<string, PlanLimits> = {
  [PLAN_FREE]: { maxProjects: FREE_MAX_PROJECTS, collaboration: false },
  [PLAN_TEAM]: { maxProjects: TEAM_MAX_PROJECTS, collaboration: true },
}

export function planLimits(plan: string): PlanLimits {
  return PLAN_LIMITS[plan] ?? PLAN_LIMITS[PLAN_FREE]
}

// Billable seats for a Team org: every member except one free "super-user"
// (pricing note: an admin plus 2 developers = 2 seats), with a floor of 1 so
// a Team subscription is never $0.
export function billableSeats(memberCount: number): number {
  return Math.max(memberCount - 1, 1)
}

export async function countOrgMembers(orgId: string): Promise<number> {
  const rows = await db.select({ value: count() }).from(orgMembers).where(eq(orgMembers.org_id, orgId))
  return rows[0]?.value ?? 0
}

export async function countOrgProjects(orgId: string): Promise<number> {
  const rows = await db.select({ value: count() }).from(projects)
    .where(and(eq(projects.org_id, orgId), isNull(projects.deleted_at)))
  return rows[0]?.value ?? 0
}

export async function getOrgPlan(orgId: string): Promise<string> {
  const rows = await db.select({ plan: orgs.plan }).from(orgs)
    .where(and(eq(orgs.id, orgId), isNull(orgs.deleted_at)))
    .limit(1)
  return rows[0]?.plan ?? PLAN_FREE
}

// Hard gate on project creation. Over-limit orgs (e.g. after a downgrade from
// Team) keep everything - nothing is deleted or locked - they just can't
// create new projects until they're back under the cap.
export async function assertProjectCapacity(orgId: string): Promise<void> {
  const plan = await getOrgPlan(orgId)
  const limit = planLimits(plan).maxProjects
  const current = await countOrgProjects(orgId)
  if (current >= limit) {
    throw new HttpError(402, {
      error: `Project limit reached: the ${plan} plan allows ${limit} projects and this organization has ${current}. Upgrade to Team at Organization settings → Billing.`,
    })
  }
}

// Hard gate on collaboration - inviting members and creating teams is the
// Team-plan feature per /pricing. Enforced on the creation routes (invite,
// team create). Same keep-everything philosophy as the project cap: an org
// downgraded to free keeps its existing members, teams, and grants working -
// it just can't add new ones until it upgrades again. Deleting members and
// teams stays allowed so a downgrade is always fixable.
export async function assertCollaborationAllowed(orgId: string): Promise<void> {
  const plan = await getOrgPlan(orgId)
  if (!planLimits(plan).collaboration) {
    throw new HttpError(402, {
      error: `Inviting members and teams requires the Team plan - $${TEAM_SEAT_MONTHLY_USD}/developer/month. Upgrade at Organization settings → Billing.`,
    })
  }
}

export async function getOrgSubscription(orgId: string): Promise<BillingSubscription | null> {
  const rows = await db.select().from(billingSubscriptions)
    .where(eq(billingSubscriptions.org_id, orgId))
    .limit(1)
  return rows[0] ?? null
}

// Statuses that count as paid. past_due keeps Team access during the dunning
// window - Stripe retries the card, and the subscription only ends (plan →
// free) if those retries ultimately fail.
const PAID_STATUSES = ['active', 'trialing', 'past_due']

export function isPaidStatus(status: string): boolean {
  return PAID_STATUSES.includes(status)
}

// Re-pushes the org's member count to Stripe as the subscription quantity.
// Best-effort by design: it is called fire-and-forget after member add/remove
// and must never fail the membership operation - a Stripe hiccup just means
// the next sync (or webhook) corrects it.
export async function syncOrgSeats(orgId: string): Promise<void> {
  try {
    const sub = await getOrgSubscription(orgId)
    if (!sub?.stripe_subscription_id || !isBillingEnabled()) return

    const members = await countOrgMembers(orgId)
    const seats = billableSeats(members)
    if (seats === sub.seat_count) return

    const remote = await getSubscription(sub.stripe_subscription_id)
    if (!isPaidStatus(remote.status)) return
    const item = remote.items?.data?.[0]
    if (!item) return
    if (subscriptionSeats(remote) === seats) {
      await db.update(billingSubscriptions).set({ seat_count: seats, updated_at: new Date() })
        .where(eq(billingSubscriptions.org_id, orgId))
      return
    }

    await updateSubscriptionQuantity(remote.id, item.id, seats)
    await db.update(billingSubscriptions).set({ seat_count: seats, updated_at: new Date() })
      .where(eq(billingSubscriptions.org_id, orgId))
  } catch (err) {
    console.error(`[billing] seat sync failed for org ${orgId}:`, err)
  }
}

// Cancels the org's Stripe subscription. Best-effort fire-and-forget from the
// org DELETE route - the webhook does the authoritative plan/state cleanup.
export async function cancelOrgSubscription(orgId: string): Promise<void> {
  try {
    const sub = await getOrgSubscription(orgId)
    if (!sub?.stripe_subscription_id || !isBillingEnabled()) return
    await cancelSubscription(sub.stripe_subscription_id)
  } catch (err) {
    console.error(`[billing] cancel-on-delete failed for org ${orgId}:`, err)
  }
}

export interface BillingView {
  plan: string
  memberCount: number
  billableSeats: number
  projectCount: number
  maxProjects: number
  collaborationAllowed: boolean
  billingEnabled: boolean
  subscription: {
    status: string
    seatCount: number
    currentPeriodEnd: string | null
    cancelAtPeriodEnd: boolean
  } | null
}

// Summary for the org settings UI. Entirely DB-backed - loading the settings
// page never blocks on Stripe.
export async function getBillingView(orgId: string): Promise<BillingView> {
  const [plan, memberCount, projectCount, sub] = await Promise.all([
    getOrgPlan(orgId),
    countOrgMembers(orgId),
    countOrgProjects(orgId),
    getOrgSubscription(orgId),
  ])
  return {
    plan,
    memberCount,
    billableSeats: billableSeats(memberCount),
    projectCount,
    maxProjects: planLimits(plan).maxProjects,
    collaborationAllowed: planLimits(plan).collaboration,
    billingEnabled: isBillingEnabled(),
    subscription: sub
      ? {
          status: sub.status,
          seatCount: sub.seat_count,
          currentPeriodEnd: sub.current_period_end?.toISOString() ?? null,
          cancelAtPeriodEnd: sub.cancel_at_period_end,
        }
      : null,
  }
}

