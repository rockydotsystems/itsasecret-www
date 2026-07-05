import { createFileRoute } from '@tanstack/react-router'
import { eq, and, isNotNull } from 'drizzle-orm'
import { db } from '~/lib/db'
import { secrets } from '~/lib/schema'
import { auditLog } from '~/lib/db-utils'
import { requireAuth, errorResponse } from '~/lib/auth'
import { requireEnvRole, ROLE_WRITE, ROLE_ADMIN } from '~/lib/rbac'

// Un-deletes a soft-deleted secret. The stored org-key ciphertext was never
// touched by the delete, so this needs no crypto - and the (env_id, key)
// unique constraint guarantees no live row with the same key can exist.
export const Route = createFileRoute('/api/envs/$envId/secrets/$key/restore')({
  server: {
    handlers: {
      POST: async ({ request, params }) => {
        try {
          const { user } = await requireAuth(request)
          const orgId = await requireEnvRole(params, user.id, [ROLE_WRITE, ROLE_ADMIN])
          const envId = params.envId!
          const key = params.key!

          const rows = await db.select({ id: secrets.id }).from(secrets)
            .where(and(eq(secrets.env_id, envId), eq(secrets.key, key), isNotNull(secrets.deleted_at)))
            .limit(1)
          const deleted = rows[0] ?? null
          if (!deleted) return Response.json({ error: 'No deleted secret with this key' }, { status: 404 })

          await db.update(secrets)
            .set({ deleted_at: null, hidden_at: null, updated_at: new Date() })
            .where(eq(secrets.id, deleted.id))

          await auditLog({ orgId, actorUserId: user.id, action: 'secret.restore', targetType: 'secret', targetId: key, metadata: { envId } })
          return new Response(null, { status: 204 })
        } catch (err) {
          return errorResponse(err)
        }
      },
    },
  },
})
