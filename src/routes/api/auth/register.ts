import { createFileRoute } from '@tanstack/react-router'
import { z } from 'zod'
import { eq } from 'drizzle-orm'
import { db } from '~/lib/db'
import { users, orgs, orgMembers } from '~/lib/schema'
import { generateId, auditLog, createProjectWithProductionEnv } from '~/lib/db-utils'
import { createSession } from '~/lib/sessions'
import { deriveKey, hashPassword, DEFAULT_KDF_PARAMS } from '~/lib/crypto/kdf'
import { generateKey, wrapKey, encrypt } from '~/lib/crypto/envelope'
import { generateKeyPair, deriveSessionKey } from '~/lib/crypto/ecdh'
import { base64Encode } from '~/lib/crypto/base64'
import { errorResponse } from '~/lib/auth'
import { createSessionCookieHeader } from '~/lib/session-cookie'
import { getClientIP, isRateLimited } from '~/lib/rate-limit'

const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(12),
  clientPubkey: z.string(),
})

function isDuplicateEmailError(err: unknown): boolean {
  const cause = (err as { cause?: { code?: string; constraint_name?: string } })?.cause
  return cause?.code === '23505' && cause?.constraint_name === 'users_email_unique'
}

function isSecureRequest(request: Request): boolean {
  const url = new URL(request.url)
  const forwardedProto = request.headers.get('x-forwarded-proto')
  return forwardedProto === 'https' || url.protocol === 'https:'
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

          const body = registerSchema.parse(await request.json())
          const { email, password, clientPubkey } = body

          const existingRows = await db.select({ id: users.id }).from(users).where(eq(users.email, email)).limit(1)
          if (existingRows[0]) {
            return Response.json({ error: 'Email already registered' }, { status: 409 })
          }

          // Dedicated password hash salt and KDF salt are independent so the
          // password hash cannot reveal the KDF-derived master key.
          const kdfSalt = crypto.getRandomValues(new Uint8Array(16))
          const kdfSaltB64 = base64Encode(kdfSalt)

          const passwordHash = await hashPassword(password)
          const derivedKey = await deriveKey(password, kdfSalt)

          const orgKey = generateKey()
          const wrappedOrgKey = await wrapKey(derivedKey, orgKey)

          const userId = generateId()
          await db.insert(users).values({
            id: userId,
            email,
            password_hash: passwordHash,
            kdf_salt: kdfSaltB64,
            kdf_params: JSON.stringify(DEFAULT_KDF_PARAMS),
          })

          const orgId = generateId()
          await db.insert(orgs).values({
            id: orgId,
            name: `${email}'s org`,
            kind: 'personal',
            owner_user_id: userId,
          })

          await db.insert(orgMembers).values({
            org_id: orgId,
            user_id: userId,
            role: 'owner',
            wrapped_org_key: wrappedOrgKey,
          })

          const projectId = await createProjectWithProductionEnv(orgId, 'default', userId)

          const { publicKey: serverPubkey, privateKey } = await generateKeyPair()
          const sessionKey = await deriveSessionKey(privateKey, clientPubkey)

          const encryptedOrgKey = await encrypt(sessionKey, base64Encode(orgKey))
          const orgKeys: Record<string, string> = { [orgId]: encryptedOrgKey }

          const { token } = await createSession(userId, serverPubkey, orgKeys)

          await auditLog({ actorUserId: userId, action: 'user.register', targetType: 'user', targetId: userId })
          await auditLog({ orgId, actorUserId: userId, action: 'org.create', targetType: 'org', targetId: orgId })
          await auditLog({ orgId, actorUserId: userId, action: 'project.create', targetType: 'project', targetId: projectId })

          const headers = new Headers()
          headers.set('Set-Cookie', createSessionCookieHeader(token, isSecureRequest(request)))

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

