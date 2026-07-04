import { createFileRoute } from '@tanstack/react-router'
import { eq, and, desc } from 'drizzle-orm'
import { db } from '~/lib/db'
import { envVarHistory, users } from '~/lib/schema'
import { auditLog } from '~/lib/db-utils'
import { requireAuth, errorResponse } from '~/lib/auth'
import { requireEnvRole, ROLE_READ, ROLE_WRITE, ROLE_ADMIN } from '~/lib/rbac'
import { decrypt } from '~/lib/crypto/envelope'
import { getServerSecretKey } from '~/lib/server-secret'

// Lists the 7-day history of a plain env var. History rows are encrypted at
// rest under the server secret; they're decrypted here because live var
// values are plaintext to callers by design — same trust level.
export const Route = createFileRoute('/api/envs/$envId/vars/$key/history')({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        try {
          const { user } = await requireAuth(request)
          const orgId = await requireEnvRole(params, user.id, [ROLE_READ, ROLE_WRITE, ROLE_ADMIN])
          const envId = params.envId!
          const key = params.key!

          const rows = await db.select({
            id: envVarHistory.id,
            change_type: envVarHistory.change_type,
            changed_by: users.email,
            created_at: envVarHistory.created_at,
            encrypted_value: envVarHistory.encrypted_value,
          }).from(envVarHistory)
            .innerJoin(users, eq(users.id, envVarHistory.changed_by))
            .where(and(eq(envVarHistory.env_id, envId), eq(envVarHistory.key, key)))
            .orderBy(desc(envVarHistory.created_at))

          const serverKey = await getServerSecretKey()
          const entries = await Promise.all(rows.map(async (row) => ({
            id: row.id,
            change_type: row.change_type,
            changed_by: row.changed_by,
            created_at: row.created_at,
            value: await decrypt(serverKey, row.encrypted_value),
          })))

          await auditLog({ orgId, actorUserId: user.id, action: 'var.history', targetType: 'env_var', targetId: key, metadata: { envId } })

          return Response.json(entries, { status: 200 })
        } catch (err) {
          return errorResponse(err)
        }
      },
    },
  },
})
