import { createFileRoute } from '@tanstack/react-router'
import { z } from 'zod'
import { eq } from 'drizzle-orm'
import { db } from '~/lib/db'
import { users } from '~/lib/schema'
import { generateId, auditLog } from '~/lib/db-utils'
import { createSession } from '~/lib/sessions'
import { hashPassword, DEFAULT_KDF_PARAMS } from '~/lib/crypto/kdf'
import { generateKeyPair } from '~/lib/crypto/ecdh'
import { base64Encode } from '~/lib/crypto/base64'
import { errorResponse } from '~/lib/auth'
import { createSessionCookieHeader, shouldSetSecureCookie } from '~/lib/session-cookie'
import { getClientIP, isRateLimited, recordFailedAttempt } from '~/lib/rate-limit'
import { createEmailVerification, verificationUrl } from '~/lib/email-verification'
import { sendVerificationEmail } from '~/lib/email'

const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(12),
  clientPubkey: z.string(),
})

function isDuplicateEmailError(err: unknown): boolean {
  const cause = (err as { cause?: { code?: string; constraint_name?: string } })?.cause
  return cause?.code === '23505' && cause?.constraint_name === 'users_email_unique'
}

export const Route = createFileRoute('/api/auth/register')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const clientIP = getClientIP(request)
          const registerKey = `register:${clientIP}`
          const rateLimit = isRateLimited(registerKey)
          if (rateLimit.limited) {
            return Response.json(
              { error: 'Too many registration attempts. Please try again later.' },
              { status: 429, headers: { 'Retry-After': String(rateLimit.retryAfterSeconds) } }
            )
          }
          // Every attempt counts against the window - this is abuse protection
          // (account/email-send flooding), not failure tracking. Without this
          // the isRateLimited check above never trips.
          recordFailedAttempt(registerKey)

          const body = registerSchema.parse(await request.json())
          const email = body.email.trim().toLowerCase()
          const { password } = body

          const existingRows = await db.select({ id: users.id }).from(users).where(eq(users.email, email)).limit(1)
          if (existingRows[0]) {
            return Response.json({ error: 'Email already registered' }, { status: 409 })
          }

          // Dedicated password hash salt and KDF salt are independent so the
          // password hash cannot reveal the KDF-derived master key.
          const kdfSalt = crypto.getRandomValues(new Uint8Array(16))
          const kdfSaltB64 = base64Encode(kdfSalt)

          const passwordHash = await hashPassword(password)

          const userId = generateId()
          await db.insert(users).values({
            id: userId,
            email,
            password_hash: passwordHash,
            kdf_salt: kdfSaltB64,
            kdf_params: JSON.stringify(DEFAULT_KDF_PARAMS),
          })

          // No orgs/projects are provisioned at signup - the onboarding wizard
          // creates the personal org (with a client-wrapped key), first project,
          // and first environment after email verification.
          const { publicKey: serverPubkey } = await generateKeyPair()
          const orgKeys: Record<string, string> = {}

          const { token } = await createSession(userId, serverPubkey, orgKeys)

          // New accounts start unverified (users.email_verified_at is null).
          // Issue a single-use token and email the verification link.
          const { token: verifyToken } = await createEmailVerification(userId)
          const verifyUrl = verificationUrl(request, verifyToken)
          // Best-effort: the account already exists, so a mail hiccup must not
          // fail signup - the user can re-request verification later.
          try {
            await sendVerificationEmail({ to: email, verifyUrl })
          } catch (mailErr) {
            console.error('[email] verification send threw:', mailErr)
          }

          await auditLog({ actorUserId: userId, action: 'user.register', targetType: 'user', targetId: userId })

          const headers = new Headers()
          headers.set('Set-Cookie', createSessionCookieHeader(token, shouldSetSecureCookie(request)))

          return Response.json({ token, serverPubkey, orgKeys }, { status: 201, headers })
        } catch (err) {
          // Concurrent registrations can both pass the pre-insert email check;
          // the loser hits the unique constraint instead.
          if (isDuplicateEmailError(err)) {
            return Response.json({ error: 'Email already registered' }, { status: 409 })
          }
          return errorResponse(err)
        }
      },
    },
  },
})

