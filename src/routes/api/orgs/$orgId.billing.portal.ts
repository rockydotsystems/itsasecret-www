import { createFileRoute } from '@tanstack/react-router'
import { requireAuth, errorResponse, jsonError } from '~/lib/auth'
import { requireOrgRole, ORG_ROLE_OWNER, ORG_ROLE_ADMIN } from '~/lib/rbac'
import { isBillingEnabled, createPortalSession } from '~/lib/stripe'
import { getOrgSubscription } from '~/lib/plans'

// Opens Stripe's hosted billing portal - payment method, invoices, and
// cancellation are all handled by Stripe there. Requires a customer row,
// which only exists after the org has been through checkout once.
export const Route = createFileRoute('/api/orgs/$orgId/billing/portal')({
  server: {
    handlers: {
      POST: async ({ request, params }) => {
        try {
          const { user } = await requireAuth(request)
          const orgId = await requireOrgRole(params, user.id, [ORG_ROLE_OWNER, ORG_ROLE_ADMIN])
          if (!isBillingEnabled()) throw jsonError('Billing is not configured on this server', 503)

          const sub = await getOrgSubscription(orgId)
          if (!sub) throw jsonError('No billing account yet - start with "Upgrade to Team"', 404)

          const baseUrl = process.env.APP_URL ?? new URL(request.url).origin
          const session = await createPortalSession(sub.stripe_customer_id, `${baseUrl}/dashboard/${orgId}/settings`)
          return Response.json({ url: session.url }, { status: 200 })
        } catch (err) {
          return errorResponse(err)
        }
      },
    },
  },
})
