import { createFileRoute } from '@tanstack/react-router'
import { z } from 'zod'
import { eq, and } from 'drizzle-orm'
import { db } from '~/lib/db'
import { users, orgMembers } from '~/lib/schema'
import { auditLog } from '~/lib/db-utils'
import { createSession } from '~/lib/sessions'
import { deriveKey, verifyPassword, isLegacyPasswordHash, verifyLegacyPasswordHash, hashPassword } from '~/lib/crypto/kdf'
import type { KdfParams } from '~/lib/crypto/kdf'
import { unwrapKey, wrapKey, encrypt } from '~/lib/crypto/envelope'
import { isPendingOrgKey, unwrapPendingOrgKey } from '~/lib/pending-org-key'
import { generateKeyPair, deriveSessionKey } from '~/lib/crypto/ecdh'
import { base64Decode, base64Encode } from '~/lib/crypto/base64'
import { errorResponse } from '~/lib/auth'
import { createSessionCookieHeader } from '~/lib/session-cookie'
import { getClientIP, isRateLimited, recordFailedAttempt, resetAttempts } from '~/lib/rate-limit'
import { runDummyPasswordHash } from '~/lib/crypto/kdf'

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string(),
  clientPubkey: z.string(),
  // 'cli' sessions are short-lived and roll their token on every successful
  // request (see lib/sessions.ts); the default 'web' keeps long sessions.
  client: z.enum(['web', 'cli']).optional(),
})

function isSecureRequest(request: Request): boolean {
  const url = new URL(request.url)
  const forwardedProto = request.headers.get('x-forwarded-proto')
  return forwardedProto === 'https' || url.protocol === 'https:'
}

export const Route = createFileRoute('/api/auth/login')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const clientIP = getClientIP(request)
          const rateLimit = isRateLimited(clientIP)
          if (rateLimit.limited) {
            return Response.json(
              { error: 'Too many login attempts. Please try again later.' },
              { status: 429, headers: { 'Retry-After': String(rateLimit.retryAfterSeconds) } }
            )
          }

          const body = loginSchema.parse(await request.json())
          const { email, password, clientPubkey } = body
          const kind = body.client ?? 'web'

          const userRows = await db.select().from(users).where(eq(users.email, email)).limit(1)
          const user = userRows[0] ?? null
          if (!user) {
            // Run a dummy password hash to keep timing similar to a valid user,
            // mitigating email-enumeration via response timing.
            await runDummyPasswordHash()
            recordFailedAttempt(clientIP)
            return Response.json({ error: 'Invalid credentials' }, { status: 401 })
          }

          // Per-account throttle, independent of IP: without it a botnet spread
          // across many source IPs could brute-force one account unhindered
          // (each IP stays under its own limit). Keyed by user id, not email,
          // so it can't be used to probe which emails exist.
          const acctKey = `login:acct:${user.id}`
          const acctLimit = isRateLimited(acctKey)
          if (acctLimit.limited) {
            return Response.json(
              { error: 'Too many login attempts. Please try again later.' },
              { status: 429, headers: { 'Retry-After': String(acctLimit.retryAfterSeconds) } }
            )
          }

          const kdfParams: KdfParams = JSON.parse(user.kdf_params)
          const kdfSalt = base64Decode(user.kdf_salt)

          // Verify the password with the dedicated password hash. Legacy hashes
          // reuse the KDF output, which leaks the master key; we handle them
          // for migration and upgrade them below.
          let passwordValid = false
          if (isLegacyPasswordHash(user.password_hash)) {
            passwordValid = await verifyLegacyPasswordHash(password, user.password_hash, kdfParams)
          } else {
            passwordValid = await verifyPassword(password, user.password_hash)
          }
          if (!passwordValid) {
            recordFailedAttempt(clientIP)
            recordFailedAttempt(acctKey)
            return Response.json({ error: 'Invalid credentials' }, { status: 401 })
          }

          // Derive the master key once and reuse it for unwrapping org keys.
          const derivedKey = await deriveKey(password, kdfSalt, kdfParams)

          const memberRows = await db.select().from(orgMembers).where(eq(orgMembers.user_id, user.id))

          const { publicKey: serverPubkey, privateKey } = await generateKeyPair()
          const sessionKey = await deriveSessionKey(privateKey, clientPubkey)

          const orgKeys: Record<string, string> = {}
          // Org keys wrapped under the user's master-password-derived key -
          // safe for a client to persist locally: useless without the master
          // password.
          const masterWrappedOrgKeys: Record<string, string> = {}
          for (const member of memberRows) {
            let orgKey: Uint8Array
            let masterWrapped = member.wrapped_org_key
            if (isPendingOrgKey(member.wrapped_org_key)) {
              // Invited member logging in for the first time since the invite:
              // finish the re-key by wrapping the org key under their master key.
              orgKey = await unwrapPendingOrgKey(member.wrapped_org_key)
              masterWrapped = await wrapKey(derivedKey, orgKey)
              await db.update(orgMembers)
                .set({ wrapped_org_key: masterWrapped })
                .where(and(eq(orgMembers.org_id, member.org_id), eq(orgMembers.user_id, user.id)))
            } else {
              orgKey = await unwrapKey(derivedKey, member.wrapped_org_key)
            }
            orgKeys[member.org_id] = await encrypt(sessionKey, base64Encode(orgKey))
            masterWrappedOrgKeys[member.org_id] = masterWrapped
          }

          const { token, expiresAt } = await createSession(user.id, serverPubkey, orgKeys, kind)

          // Upgrade legacy password hashes to the new format on successful login.
          // This removes the leak where the hash exposed the KDF-derived key.
          if (isLegacyPasswordHash(user.password_hash)) {
            const newPasswordHash = await hashPassword(password)
            await db.update(users).set({ password_hash: newPasswordHash }).where(eq(users.id, user.id))
          }

          resetAttempts(clientIP)
          resetAttempts(acctKey)
          await auditLog({ actorUserId: user.id, action: 'user.login' })

          const headers = new Headers()
          headers.set('Set-Cookie', createSessionCookieHeader(token, isSecureRequest(request)))

          return Response.json({
            token,
            serverPubkey,
            orgKeys,
            masterWrappedOrgKeys,
            sessionExpiresAt: expiresAt.toISOString(),
          }, { status: 200, headers })
        } catch (err) {
          return errorResponse(err)
        }
      },
    },
  },
})

