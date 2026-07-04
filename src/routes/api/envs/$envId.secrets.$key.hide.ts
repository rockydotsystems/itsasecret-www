import { createFileRoute } from '@tanstack/react-router'
import { eq, and, isNotNull, isNull } from 'drizzle-orm'
import { db } from '~/lib/db'
import { secrets } from '~/lib/schema'
import { auditLog } from '~/lib/db-utils'
import { requireAuth, errorResponse } from '~/lib/auth'
import { requireEnvRole, ROLE_WRITE, ROLE_ADMIN } from '~/lib/rbac'

// "Perma delete" a soft-deleted secret: hides it from the recently-deleted UI.
// The row (and its ciphertext) is retained until the 90-day purge — this does
// not shorten retention, it only removes the restore surface.
export const Route = createFileRoute('/api/envs/$envId/secrets/$key/hide')({
  server: {
    handlers: {
      POST: async ({ request, params }) => {
        try {
          const { user } = await requireAuth(request)
          const orgId = await requireEnvRole(params, user.id, [ROLE_WRITE, ROLE_ADMIN])
          const envId = params.envId!
          const key = params.key!

          const rows = await db.select({ id: secrets.id }).from(secrets)
            .where(and(
              eq(secrets.env_id, envId),
              eq(secrets.key, key),
              isNotNull(secrets.deleted_at),
              isNull(secrets.hidden_at)
            ))
            .limit(1)
          const deleted = rows[0] ?? null
          if (!deleted) return Response.json({ error: 'No deleted secret with this key' }, { status: 404 })

          await db.update(secrets).set({ hidden_at: new Date() }).where(eq(secrets.id, deleted.id))

          await auditLog({ orgId, actorUserId: user.id, action: 'secret.hide', targetType: 'secret', targetId: key, metadata: { envId } })
          return new Response(null, { status: 204 })
        } catch (err) {
          return errorResponse(err)
        }
      },
    },
  },
})
