import { createFileRoute } from '@tanstack/react-router'
import { db } from '~/lib/db'
import { auditLog } from '~/lib/db-utils'
import { requireAuth, errorResponse } from '~/lib/auth'
import { requireOrgRole, ORG_ROLE_OWNER, ORG_ROLE_ADMIN } from '~/lib/rbac'
import type { OrgRow } from '~/lib/types'

export const Route = createFileRoute('/api/orgs/$orgId/members/$userId')({
  server: {
    handlers: {
      DELETE: async ({ request, params }) => {
        try {
          const { user } = await requireAuth(request)
          await requireOrgRole(params, user.id, [ORG_ROLE_OWNER, ORG_ROLE_ADMIN])
          const orgId = params.orgId!
          const targetUserId = params.userId!

          const org = await db.prepare('SELECT * FROM orgs WHERE id = ? AND deleted_at IS NULL').bind(orgId).first<OrgRow>()
          if (!org) return Response.json({ error: 'Org not found' }, { status: 404 })
          if (org.owner_user_id === targetUserId) return Response.json({ error: 'Cannot remove the org owner' }, { status: 403 })

          await db.prepare('DELETE FROM org_members WHERE org_id = ? AND user_id = ?').bind(orgId, targetUserId).run()
          await auditLog({ orgId, actorUserId: user.id, action: 'member.remove', targetType: 'user', targetId: targetUserId })
          return new Response(null, { status: 204 })
        } catch (err) {
          return errorResponse(err)
        }
      },
    },
  },
})
