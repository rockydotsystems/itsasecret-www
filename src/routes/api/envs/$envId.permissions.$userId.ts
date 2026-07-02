import { createFileRoute } from '@tanstack/react-router'
import { eq, and } from 'drizzle-orm'
import { db } from '~/lib/db'
import { envPermissions } from '~/lib/schema'
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

          await db.delete(envPermissions)
            .where(and(eq(envPermissions.env_id, envId), eq(envPermissions.user_id, targetUserId)))
          await auditLog({ orgId, actorUserId: user.id, action: 'env.permission.revoke', targetType: 'env', targetId: envId, metadata: { userId: targetUserId } })
          return new Response(null, { status: 204 })
        } catch (err) {
          return errorResponse(err)
        }
      },
    },
  },
})
