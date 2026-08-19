import { createFileRoute } from '@tanstack/react-router'
import { z } from 'zod'
import { eq, and, ne, inArray, isNull } from 'drizzle-orm'
import { db } from '~/lib/db'
import { users, sessions, deviceTokens } from '~/lib/schema'
import { auditLog } from '~/lib/db-utils'
import { requireAuth, errorResponse } from '~/lib/auth'
import { generateRecoveryPhrase, hashRecoveryPhrase } from '~/lib/recovery-phrase'
import { isRateLimited } from '~/lib/rate-limit'

const regenerateSchema = z.object({
  // Opt-in cleanup toggles, mirroring the UI checkboxes. Trusted devices
  // survive by default so rotating a leaked/lost phrase doesn't instantly
  // lock out the user's other machines.
  revokeDevices: z.boolean().optional().default(false),
  revokeOtherSessions: z.boolean().optional().default(false),
})

// Recovery-phrase rotation. Authenticated-only by design: "regenerated if
// forgotten but only by an already logged in person". The new phrase replaces
// the old one in one write - the old phrase stops working for device
// enrollment immediately. The plaintext phrase appears in exactly one
// response (this one); the server stores only its hash.
export const Route = createFileRoute('/api/auth/regenerate-recovery')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          // allowNoRecovery: this endpoint is how a legacy account creates its
          // first phrase, so it can't itself be gated on having one.
          const { user, session } = await requireAuth(request, { allowNoRecovery: true })

          // Tight per-user budget: rotation is rare, and unlimited retries
          // would let a hijacked session churn phrases to confuse the user
          // about which printout is current.
          const rateKey = `regen-recovery:${user.id}`
          const rateLimit = isRateLimited(rateKey, 5)
          if (rateLimit.limited) {
            return Response.json(
              { error: 'Too many attempts. Please try again later.' },
              { status: 429, headers: { 'Retry-After': String(rateLimit.retryAfterSeconds) } }
            )
          }

          const body = regenerateSchema.parse(await request.json())

          const phrase = generateRecoveryPhrase()
          const phraseHash = await hashRecoveryPhrase(phrase)

          const now = new Date()
          await db.transaction(async (tx) => {
            await tx.update(users)
              .set({ recovery_phrase_hash: phraseHash, updated_at: now })
              .where(eq(users.id, user.id))
            if (body.revokeDevices) {
              await tx.update(deviceTokens)
                .set({ revoked_at: now })
                .where(and(eq(deviceTokens.user_id, user.id), isNull(deviceTokens.revoked_at)))
            }
            if (body.revokeOtherSessions) {
              await tx.update(sessions)
                .set({ revoked_at: now })
                .where(and(
                  eq(sessions.user_id, user.id),
                  ne(sessions.id, session.id),
                  inArray(sessions.kind, ['web', 'cli']),
                  isNull(sessions.revoked_at),
                ))
            }
          })

          await auditLog({
            actorUserId: user.id,
            action: 'user.recovery_phrase.rotate',
            targetType: 'user',
            targetId: user.id,
            metadata: { revokedDevices: body.revokeDevices, revokedOtherSessions: body.revokeOtherSessions },
          })

          return Response.json({ recoveryPhrase: phrase }, { status: 200 })
        } catch (err) {
          return errorResponse(err)
        }
      },
    },
  },
})
