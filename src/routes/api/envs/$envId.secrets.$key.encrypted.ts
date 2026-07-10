import { createFileRoute } from '@tanstack/react-router'
import { eq, and, isNull } from 'drizzle-orm'
import { db } from '~/lib/db'
import { secrets } from '~/lib/schema'
import { auditLog } from '~/lib/db-utils'
import { requireAuth, errorResponse, validateKey } from '~/lib/auth'
import { requireEnvRole, ROLE_READ, ROLE_WRITE, ROLE_ADMIN } from '~/lib/rbac'
import { isRateLimited, recordFailedAttempt } from '~/lib/rate-limit'

// Returns the stored org-key ciphertext verbatim for client-side decryption
// (web E2E flow). The server never handles the plaintext or the org key here;
// the caller unwraps the org key locally with their master password.
export const Route = createFileRoute('/api/envs/$envId/secrets/$key/encrypted')({
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
          const revealLimit = isRateLimited(revealKey)
          if (revealLimit.limited) {
            return Response.json(
              { error: 'Too many reveal requests. Please try again later.' },
              { status: 429, headers: { 'Retry-After': String(revealLimit.retryAfterSeconds) } }
            )
          }
          recordFailedAttempt(revealKey)

          const secretRows = await db.select({ encrypted_value: secrets.encrypted_value }).from(secrets)
            .where(and(eq(secrets.env_id, envId), eq(secrets.key, key), isNull(secrets.deleted_at)))
            .limit(1)
          const secret = secretRows[0] ?? null
          if (!secret) return Response.json({ error: 'Secret not found' }, { status: 404 })

          await auditLog({ orgId, actorUserId: user.id, action: 'secret.reveal', targetType: 'secret', targetId: key, metadata: { envId, mode: 'e2e' } })

          return Response.json({ key, encryptedValue: secret.encrypted_value }, { status: 200 })
        } catch (err) {
          return errorResponse(err)
        }
      },
    },
  },
})
