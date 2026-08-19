import { createFileRoute } from '@tanstack/react-router'
import { z } from 'zod'
import { sql } from 'drizzle-orm'
import { db } from '~/lib/db'
import { users } from '~/lib/schema'
import { auditLog } from '~/lib/db-utils'
import { errorResponse } from '~/lib/auth'
import { verifyRecoveryPhrase, hashRecoveryPhrase } from '~/lib/recovery-phrase'
import { createDeviceToken } from '~/lib/device-tokens'
import { base64Encode } from '~/lib/crypto/base64'
import { getClientIP, isRateLimited, recordFailedAttempt, resetAttempts } from '~/lib/rate-limit'

const verifyRecoverySchema = z.object({
  email: z.string().trim().email(),
  recoveryPhrase: z.string().min(1).max(4096),
  // Client-generated P-256 device public key (base64 raw). It labels the
  // device_tokens row; possession of the returned bearer token is the factor.
  devicePubkey: z.string().max(256).regex(/^[A-Za-z0-9+/]+={0,2}$/, 'devicePubkey must be base64'),
})

// A stable per-email pseudo-account key so unknown emails get their own
// throttle bucket, same trick as login.
async function pseudoAccountKey(email: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(email.toLowerCase()))
  return base64Encode(new Uint8Array(digest))
}

export const Route = createFileRoute('/api/auth/verify-recovery')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const clientIP = getClientIP(request)
          const rateLimit = isRateLimited(`verify-recovery:${clientIP}`)
          if (rateLimit.limited) {
            return Response.json(
              { error: 'Too many attempts. Please try again later.' },
              { status: 429, headers: { 'Retry-After': String(rateLimit.retryAfterSeconds) } }
            )
          }

          const body = verifyRecoverySchema.parse(await request.json())
          const email = body.email.trim().toLowerCase()

          const userRows = await db.select().from(users).where(sql`lower(${users.email}) = lower(${email})`).limit(1)
          const user = userRows[0] ?? null

          // Unknown email OR account without a phrase: burn a verification-
          // shaped KDF against a fabricated hash so response timing does not
          // reveal which case we hit. The fabricated hash is freshly generated
          // junk - same shape, never verifies.
          if (!user || !user.recovery_phrase_hash) {
            await verifyRecoveryPhrase(body.recoveryPhrase, await hashRecoveryPhrase('dummy dummy dummy'))
            const pseudoKey = `verify-recovery:acct:${await pseudoAccountKey(email)}`
            recordFailedAttempt(`verify-recovery:${clientIP}`)
            recordFailedAttempt(pseudoKey)
            return Response.json({ error: 'Invalid recovery phrase' }, { status: 401 })
          }

          const acctKey = `verify-recovery:acct:${user.id}`
          const acctLimit = isRateLimited(acctKey)
          if (acctLimit.limited) {
            return Response.json(
              { error: 'Too many attempts. Please try again later.' },
              { status: 429, headers: { 'Retry-After': String(acctLimit.retryAfterSeconds) } }
            )
          }

          const phraseValid = await verifyRecoveryPhrase(body.recoveryPhrase, user.recovery_phrase_hash)
          if (!phraseValid) {
            recordFailedAttempt(`verify-recovery:${clientIP}`)
            recordFailedAttempt(acctKey)
            return Response.json({ error: 'Invalid recovery phrase' }, { status: 401 })
          }

          // Phrase proven: enroll the device. The bearer token is what future
          // logins from this machine present instead of the phrase.
          const { token, expiresAt } = await createDeviceToken(user.id, body.devicePubkey)

          await auditLog({
            actorUserId: user.id,
            action: 'user.device.enroll',
            targetType: 'user',
            targetId: user.id,
          })

          resetAttempts(`verify-recovery:${clientIP}`)
          resetAttempts(acctKey)

          return Response.json({ deviceToken: token, deviceTokenExpiresAt: expiresAt.toISOString() }, { status: 200 })
        } catch (err) {
          return errorResponse(err)
        }
      },
    },
  },
})
