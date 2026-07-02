import { createFileRoute } from '@tanstack/react-router'
import { eq, and, isNull } from 'drizzle-orm'
import { db } from '~/lib/db'
import { orgs, orgMembers } from '~/lib/schema'
import { auditLog } from '~/lib/db-utils'
import { requireAuth, errorResponse } from '~/lib/auth'
import { requireOrgRole, ORG_ROLE_OWNER, ORG_ROLE_ADMIN } from '~/lib/rbac'

export const Route = createFileRoute('/api/orgs/$orgId/members/$userId')({
  server: {
    handlers: {
      DELETE: async ({ request, params }) => {
        try {
          const { user } = await requireAuth(request)
          await requireOrgRole(params, user.id, [ORG_ROLE_OWNER, ORG_ROLE_ADMIN])
          const orgId = params.orgId!
          const targetUserId = params.userId!

          const orgRows = await db.select().from(orgs)
            .where(and(eq(orgs.id, orgId), isNull(orgs.deleted_at)))
            .limit(1)
          const org = orgRows[0] ?? null
          if (!org) return Response.json({ error: 'Org not found' }, { status: 404 })
          if (org.owner_user_id === targetUserId) return Response.json({ error: 'Cannot remove the org owner' }, { status: 403 })

          await db.delete(orgMembers)
            .where(and(eq(orgMembers.org_id, orgId), eq(orgMembers.user_id, targetUserId)))
          await auditLog({ orgId, actorUserId: user.id, action: 'member.remove', targetType: 'user', targetId: targetUserId })
          return new Response(null, { status: 204 })
        } catch (err) {
          return errorResponse(err)
        }
      },
    },
  },
})
