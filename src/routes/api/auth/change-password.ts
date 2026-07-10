import { createFileRoute } from '@tanstack/react-router'
import { z } from 'zod'
import { eq, and } from 'drizzle-orm'
import { db } from '~/lib/db'
import { users, orgMembers } from '~/lib/schema'
import { auditLog } from '~/lib/db-utils'
import { requireAuth, errorResponse } from '~/lib/auth'
import { deriveKey, hashPassword, verifyPassword, isLegacyPasswordHash, verifyLegacyPasswordHash, DEFAULT_KDF_PARAMS } from '~/lib/crypto/kdf'
import type { KdfParams } from '~/lib/crypto/kdf'
import { unwrapKey, wrapKey } from '~/lib/crypto/envelope'
import { isPendingOrgKey } from '~/lib/pending-org-key'
import { base64Decode, base64Encode } from '~/lib/crypto/base64'
import { revokeOtherInteractiveSessions } from '~/lib/sessions'
import { isRateLimited, recordFailedAttempt, resetAttempts } from '~/lib/rate-limit'

const changePasswordSchema = z.object({
  currentPassword: z.string().max(1024),
  newPassword: z.string().min(12).max(1024),
})

// Changing the master password re-keys everything it protects, following the
// same trust model as login (the server sees the password transiently, never
// stores it): verify the current password, unwrap every org key with the old
// master key, re-wrap under the new one, and swap the password hash + KDF
// salt in one transaction. All other web/CLI sessions are revoked - a stolen
// session should not survive a password change.
export const Route = createFileRoute('/api/auth/change-password')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const { user, session } = await requireAuth(request)

          // Keyed per user, not per IP: this is an authenticated endpoint and
          // the thing being guessed is the current password.
          const rateKey = `passwd:${user.id}`
          const rateLimit = isRateLimited(rateKey)
          if (rateLimit.limited) {
            return Response.json(
              { error: 'Too many attempts. Please try again later.' },
              { status: 429, headers: { 'Retry-After': String(rateLimit.retryAfterSeconds) } }
            )
          }

          const { currentPassword, newPassword } = changePasswordSchema.parse(await request.json())

          const kdfParams: KdfParams = JSON.parse(user.kdf_params)
          let passwordValid = false
          if (isLegacyPasswordHash(user.password_hash)) {
            passwordValid = await verifyLegacyPasswordHash(currentPassword, user.password_hash, kdfParams)
          } else {
            passwordValid = await verifyPassword(currentPassword, user.password_hash)
          }
          if (!passwordValid) {
            recordFailedAttempt(rateKey)
            return Response.json({ error: 'Current password is incorrect' }, { status: 401 })
          }

          const oldMasterKey = await deriveKey(currentPassword, base64Decode(user.kdf_salt), kdfParams)

          // Fresh salt (and current default params) for the new master key -
          // never reuse the old salt with a new password.
          const newKdfSalt = crypto.getRandomValues(new Uint8Array(16))
          const newMasterKey = await deriveKey(newPassword, newKdfSalt, DEFAULT_KDF_PARAMS)
          const newPasswordHash = await hashPassword(newPassword)

          const memberRows = await db.select().from(orgMembers).where(eq(orgMembers.user_id, user.id))
          const rewrapped: { org_id: string; wrapped_org_key: string }[] = []
          for (const member of memberRows) {
            // Pending invite keys are wrapped under the server secret, not the
            // master key - login finishes those; nothing to re-wrap here.
            if (isPendingOrgKey(member.wrapped_org_key)) continue
            const orgKey = await unwrapKey(oldMasterKey, member.wrapped_org_key)
            rewrapped.push({
              org_id: member.org_id,
              wrapped_org_key: await wrapKey(newMasterKey, orgKey),
            })
          }

          await db.transaction(async (tx) => {
            await tx.update(users)
              .set({
                password_hash: newPasswordHash,
                kdf_salt: base64Encode(newKdfSalt),
                kdf_params: JSON.stringify(DEFAULT_KDF_PARAMS),
                updated_at: new Date(),
              })
              .where(eq(users.id, user.id))
            for (const row of rewrapped) {
              await tx.update(orgMembers)
                .set({ wrapped_org_key: row.wrapped_org_key })
                .where(and(eq(orgMembers.org_id, row.org_id), eq(orgMembers.user_id, user.id)))
            }
          })

          await revokeOtherInteractiveSessions(user.id, session.id)
          resetAttempts(rateKey)
          await auditLog({ actorUserId: user.id, action: 'user.change_password', targetType: 'user', targetId: user.id })

          return Response.json({ ok: true }, { status: 200 })
        } catch (err) {
          return errorResponse(err)
        }
      },
    },
  },
})
