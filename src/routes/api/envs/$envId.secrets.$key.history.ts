import { createFileRoute } from '@tanstack/react-router'
import { eq, and, desc } from 'drizzle-orm'
import { db } from '~/lib/db'
import { secretHistory, users } from '~/lib/schema'
import { auditLog } from '~/lib/db-utils'
import { requireAuth, errorResponse } from '~/lib/auth'
import { requireEnvRole, ROLE_READ, ROLE_WRITE, ROLE_ADMIN } from '~/lib/rbac'

// Lists the 7-day history of a secret. Values are the org-key ciphertexts
// verbatim — decryption happens client-side with the unlocked vault, same as
// the live reveal flow.
export const Route = createFileRoute('/api/envs/$envId/secrets/$key/history')({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        try {
          const { user } = await requireAuth(request)
          const orgId = await requireEnvRole(params, user.id, [ROLE_READ, ROLE_WRITE, ROLE_ADMIN])
          const envId = params.envId!
          const key = params.key!

          const rows = await db.select({
            id: secretHistory.id,
            change_type: secretHistory.change_type,
            changed_by: users.email,
            created_at: secretHistory.created_at,
            encrypted_value: secretHistory.encrypted_value,
          }).from(secretHistory)
            .innerJoin(users, eq(users.id, secretHistory.changed_by))
            .where(and(eq(secretHistory.env_id, envId), eq(secretHistory.key, key)))
            .orderBy(desc(secretHistory.created_at))

          await auditLog({ orgId, actorUserId: user.id, action: 'secret.history', targetType: 'secret', targetId: key, metadata: { envId } })

          return Response.json(rows, { status: 200 })
        } catch (err) {
          return errorResponse(err)
        }
      },
    },
  },
})
