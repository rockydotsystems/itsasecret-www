import { createFileRoute } from '@tanstack/react-router'
import { db } from '~/lib/db'
import { requireAuth, errorResponse } from '~/lib/auth'
import { requireOrgRole, ORG_ROLE_OWNER, ORG_ROLE_ADMIN, ORG_ROLE_MEMBER } from '~/lib/rbac'
import type { OrgMemberRow } from '~/lib/types'

export const Route = createFileRoute('/api/orgs/$orgId/members')({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        try {
          const { user } = await requireAuth(request)
          await requireOrgRole(params, user.id, [ORG_ROLE_OWNER, ORG_ROLE_ADMIN, ORG_ROLE_MEMBER])
          const orgId = params.orgId!
          const result = await db.prepare(
            `SELECT org_id, user_id, role, invited_by, created_at FROM org_members WHERE org_id = ?`
          ).bind(orgId).all<OrgMemberRow>()
          return Response.json(result.results, { status: 200 })
        } catch (err) {
          return errorResponse(err)
        }
      },
    },
  },
})
