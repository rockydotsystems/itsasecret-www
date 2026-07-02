import { createFileRoute } from '@tanstack/react-router'
import { eq } from 'drizzle-orm'
import { db } from '~/lib/db'
import { orgMembers } from '~/lib/schema'
import { requireAuth, errorResponse } from '~/lib/auth'
import { requireOrgRole, ORG_ROLE_OWNER, ORG_ROLE_ADMIN, ORG_ROLE_MEMBER } from '~/lib/rbac'

export const Route = createFileRoute('/api/orgs/$orgId/members')({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        try {
          const { user } = await requireAuth(request)
          await requireOrgRole(params, user.id, [ORG_ROLE_OWNER, ORG_ROLE_ADMIN, ORG_ROLE_MEMBER])
          const orgId = params.orgId!
          const rows = await db.select({
            org_id: orgMembers.org_id,
            user_id: orgMembers.user_id,
            role: orgMembers.role,
            invited_by: orgMembers.invited_by,
            created_at: orgMembers.created_at,
          }).from(orgMembers).where(eq(orgMembers.org_id, orgId))
          return Response.json(rows, { status: 200 })
        } catch (err) {
          return errorResponse(err)
        }
      },
    },
  },
})
