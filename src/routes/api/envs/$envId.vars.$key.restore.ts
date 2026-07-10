import { createFileRoute } from '@tanstack/react-router'
import { eq, and, isNotNull } from 'drizzle-orm'
import { db } from '~/lib/db'
import { envVars } from '~/lib/schema'
import { auditLog } from '~/lib/db-utils'
import { requireAuth, errorResponse, validateKey } from '~/lib/auth'
import { requireEnvRole, ROLE_WRITE, ROLE_ADMIN } from '~/lib/rbac'

// Un-deletes a soft-deleted env var; the value column survives the delete.
export const Route = createFileRoute('/api/envs/$envId/vars/$key/restore')({
  server: {
    handlers: {
      POST: async ({ request, params }) => {
        try {
          const { user } = await requireAuth(request)
          const orgId = await requireEnvRole(params, user.id, [ROLE_WRITE, ROLE_ADMIN])
          const envId = params.envId!
          const key = params.key!
          validateKey(key)

          const rows = await db.select({ id: envVars.id }).from(envVars)
            .where(and(eq(envVars.env_id, envId), eq(envVars.key, key), isNotNull(envVars.deleted_at)))
            .limit(1)
          const deleted = rows[0] ?? null
          if (!deleted) return Response.json({ error: 'No deleted variable with this key' }, { status: 404 })

          await db.update(envVars)
            .set({ deleted_at: null, hidden_at: null, updated_at: new Date() })
            .where(eq(envVars.id, deleted.id))

          await auditLog({ orgId, actorUserId: user.id, action: 'var.restore', targetType: 'env_var', targetId: key, metadata: { envId } })
          return new Response(null, { status: 204 })
        } catch (err) {
          return errorResponse(err)
        }
      },
    },
  },
})
