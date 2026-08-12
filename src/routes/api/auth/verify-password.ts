import { createFileRoute } from '@tanstack/react-router'
import { z } from 'zod'
import { requireAuth, errorResponse } from '~/lib/auth'
import { verifyPassword, isLegacyPasswordHash, verifyLegacyPasswordHash } from '~/lib/crypto/kdf'
import type { KdfParams } from '~/lib/crypto/kdf'
import { isRateLimited, recordFailedAttempt, resetAttempts } from '~/lib/rate-limit'

const verifyPasswordSchema = z.object({
  password: z.string().min(1).max(1024),
})

// Proves the caller knows the master password without changing anything.
// Follows the login trust model (the server sees the password transiently,
// never stores it). Used by the workspace wizard when the vault is locked:
// the typed password must be verified before a fresh org key is wrapped
// under the derived master key - wrapping under a mistyped password corrupts
// org_members.wrapped_org_key (the real master key can never unwrap it again,
// which previously also broke login and change-password with a 500).
export const Route = createFileRoute('/api/auth/verify-password')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const { user } = await requireAuth(request)

          // Shares the change-password budget: both are password-guess
          // oracles on the same authenticated account.
          const rateKey = `passwd:${user.id}`
          const rateLimit = isRateLimited(rateKey)
          if (rateLimit.limited) {
            return Response.json(
              { error: 'Too many attempts. Please try again later.' },
              { status: 429, headers: { 'Retry-After': String(rateLimit.retryAfterSeconds) } }
            )
          }

          const { password } = verifyPasswordSchema.parse(await request.json())

          const kdfParams: KdfParams = JSON.parse(user.kdf_params)
          let passwordValid = false
          if (isLegacyPasswordHash(user.password_hash)) {
            passwordValid = await verifyLegacyPasswordHash(password, user.password_hash, kdfParams)
          } else {
            passwordValid = await verifyPassword(password, user.password_hash)
          }
          if (!passwordValid) {
            recordFailedAttempt(rateKey)
            return Response.json({ error: 'Incorrect master password' }, { status: 401 })
          }

          resetAttempts(rateKey)
          return Response.json({ ok: true }, { status: 200 })
        } catch (err) {
          return errorResponse(err)
        }
      },
    },
  },
})
