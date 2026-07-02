import { createFileRoute } from '@tanstack/react-router'
import { db } from '~/lib/db'
import { auditLog } from '~/lib/db-utils'
import { requireAuth, errorResponse } from '~/lib/auth'
import { requireEnvRole, ROLE_ADMIN } from '~/lib/rbac'

export const Route = createFileRoute('/api/envs/$envId/permissions/$userId')({
  server: {
    handlers: {
      DELETE: async ({ request, params }) => {
        try {
          const { user } = await requireAuth(request)
          const orgId = await requireEnvRole(params, user.id, [ROLE_ADMIN])
          const envId = params.envId!
          const targetUserId = params.userId!

          await db.prepare('DELETE FROM env_permissions WHERE env_id = ? AND user_id = ?').bind(envId, targetUserId).run()
          await auditLog({ orgId, actorUserId: user.id, action: 'env.permission.revoke', targetType: 'env', targetId: envId, metadata: { userId: targetUserId } })
          return new Response(null, { status: 204 })
        } catch (err) {
          return errorResponse(err)
        }
      },
    },
  },
})
