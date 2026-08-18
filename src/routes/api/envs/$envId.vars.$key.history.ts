import { createFileRoute } from '@tanstack/react-router'
import { eq, and, isNull, desc } from 'drizzle-orm'
import { db } from '~/lib/db'
import { envVarHistory, envVars, users } from '~/lib/schema'
import { auditLog } from '~/lib/db-utils'
import { requireAuth, errorResponse, validateKey } from '~/lib/auth'
import { requireEnvRole, ROLE_READ, ROLE_WRITE, ROLE_ADMIN } from '~/lib/rbac'
import { isRateLimited, recordFailedAttempt, REVEAL_MAX_ATTEMPTS } from '~/lib/rate-limit'
import { decrypt } from '~/lib/crypto/envelope'
import { getServerSecretKey, getLegacyServerSecretKey } from '~/lib/server-secret'

// Lists the 7-day history of a plain env var. History rows are encrypted at
// rest under the server secret; they're decrypted here because live var
// values are plaintext to callers by design - same trust level.
export const Route = createFileRoute('/api/envs/$envId/vars/$key/history')({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        try {
          const { user } = await requireAuth(request)
          const orgId = await requireEnvRole(params, user.id, [ROLE_READ, ROLE_WRITE, ROLE_ADMIN])
          const envId = params.envId!
          const key = params.key!
          validateKey(key)

          const revealKey = `reveal:${user.id}`
          const revealLimit = isRateLimited(revealKey, REVEAL_MAX_ATTEMPTS)
          if (revealLimit.limited) {
            return Response.json(
              { error: 'Too many reveal requests. Please try again later.' },
              { status: 429, headers: { 'Retry-After': String(revealLimit.retryAfterSeconds) } }
            )
          }
          recordFailedAttempt(revealKey)

          // No history surface once the live row is deleted or perma-deleted.
          const liveRows = await db.select({ id: envVars.id }).from(envVars)
            .where(and(eq(envVars.env_id, envId), eq(envVars.key, key), isNull(envVars.deleted_at), isNull(envVars.hidden_at)))
            .limit(1)
          if (!liveRows[0]) return Response.json({ error: 'Var not found' }, { status: 404 })

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
            .limit(200)

          const serverKey = await getServerSecretKey()
          // Rows written before the v2 key derivation shipped decrypt under
          // the v1 key (fixed salt, 100k iterations) - fall back per row.
          const legacyKey = rows.length > 0 ? await getLegacyServerSecretKey() : null
          const entries = await Promise.all(rows.map(async (row) => ({
            id: row.id,
            change_type: row.change_type,
            changed_by: row.changed_by,
            created_at: row.created_at,
            value: await decrypt(serverKey, row.encrypted_value)
              .catch(() => decrypt(legacyKey!, row.encrypted_value)),
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
