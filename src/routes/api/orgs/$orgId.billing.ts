import { createFileRoute } from '@tanstack/react-router'
import { requireAuth, errorResponse } from '~/lib/auth'
import { requireOrgRole, ORG_ROLE_OWNER, ORG_ROLE_ADMIN, ORG_ROLE_MEMBER } from '~/lib/rbac'
import { getBillingView } from '~/lib/plans'

// Plan/subscription summary for the org settings Billing section. Entirely
// DB-backed - it must load even when Stripe is unreachable.
export const Route = createFileRoute('/api/orgs/$orgId/billing')({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        try {
          const { user } = await requireAuth(request)
          const orgId = await requireOrgRole(params, user.id, [ORG_ROLE_OWNER, ORG_ROLE_ADMIN, ORG_ROLE_MEMBER])
          const view = await getBillingView(orgId)
          return Response.json(view, { status: 200 })
        } catch (err) {
          return errorResponse(err)
        }
      },
    },
  },
})
