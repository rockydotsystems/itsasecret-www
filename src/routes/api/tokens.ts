import { createFileRoute } from '@tanstack/react-router'
import { eq, and, isNull } from 'drizzle-orm'
import { z } from 'zod'
import { db } from '~/lib/db'
import { sessions } from '~/lib/schema'
import { requireAuth, getSessionKey, errorResponse, jsonError } from '~/lib/auth'
import { decrypt, encrypt, generateKey } from '~/lib/crypto/envelope'
import { base64Encode } from '~/lib/crypto/base64'
import {
  createTokenSession,
  tokenNeverExpires,
  TOKEN_MIN_DAYS,
  TOKEN_MAX_DAYS,
  TOKEN_NEVER_EXPIRES,
} from '~/lib/sessions'

// Displayed tokens look like `shht_<bearer>.<transport key>`: the bearer half
// goes in the Authorization header verbatim; the key half decrypts the org
// keys stored with the session. The key is never stored server-side, so a DB
// leak exposes neither the bearer (hashed) nor any key material.
export const TOKEN_PREFIX = 'shht_'

const createTokenSchema = z.object({
  name: z.string().trim().min(1, 'Token name is required').max(64),
  // Days until expiry; null means "does not expire".
  expiresInDays: z.number().int().min(TOKEN_MIN_DAYS).max(TOKEN_MAX_DAYS).nullable(),
})

export type AccessTokenSummary = {
  id: string
  name: string
  created_at: string
  // null = does not expire
  expires_at: string | null
}

export const Route = createFileRoute('/api/tokens')({
  server: {
    handlers: {
      // Lists the caller's access tokens (never the token values - those are
      // shown exactly once, at creation).
      GET: async ({ request }) => {
        try {
          const { user } = await requireAuth(request)
          const rows = await db.select({
            id: sessions.id,
            name: sessions.name,
            created_at: sessions.created_at,
            expires_at: sessions.expires_at,
          }).from(sessions)
            .where(and(
              eq(sessions.user_id, user.id),
              eq(sessions.kind, 'token'),
              isNull(sessions.revoked_at)
            ))
          const tokens: AccessTokenSummary[] = rows.map((r) => ({
            id: r.id,
            name: r.name ?? '',
            created_at: r.created_at.toISOString(),
            expires_at: tokenNeverExpires(r.expires_at) ? null : r.expires_at.toISOString(),
          }))
          return Response.json({ tokens }, { status: 200 })
        } catch (err) {
          return errorResponse(err)
        }
      },

      // Mints a long-lived access token for headless machines. The caller's
      // session org keys are re-wrapped under a fresh transport key that
      // becomes the second half of the displayed token, so the token alone is
      // enough for `shh auth` - no master password on the target machine.
      POST: async ({ request }) => {
        try {
          const { user, session } = await requireAuth(request)
          const sessionKey = getSessionKey(request.headers.get('X-Session-Key'))
          const parsed = createTokenSchema.safeParse(await request.json())
          if (!parsed.success) {
            return Response.json(
              { error: parsed.error.issues[0]?.message ?? 'Invalid request body' },
              { status: 400 }
            )
          }
          const { name, expiresInDays } = parsed.data

          const expiresAt = expiresInDays === null
            ? TOKEN_NEVER_EXPIRES
            : new Date(Date.now() + expiresInDays * 24 * 60 * 60 * 1000)

          const tokenKey = generateKey()
          const encryptedOrgKeys: Record<string, string> = {}
          const sessionOrgKeys: Record<string, string> = JSON.parse(session.encrypted_org_keys)
          for (const [orgId, wrapped] of Object.entries(sessionOrgKeys)) {
            let orgKeyB64: string
            try {
              orgKeyB64 = await decrypt(sessionKey, wrapped)
            } catch {
              throw jsonError('Invalid session key', 400)
            }
            encryptedOrgKeys[orgId] = await encrypt(tokenKey, orgKeyB64)
          }

          const { token, sessionId } = await createTokenSession(user.id, name, encryptedOrgKeys, expiresAt)

          return Response.json({
            id: sessionId,
            name,
            token: `${TOKEN_PREFIX}${token}.${base64Encode(tokenKey)}`,
            expiresAt: expiresInDays === null ? null : expiresAt.toISOString(),
          }, { status: 201 })
        } catch (err) {
          return errorResponse(err)
        }
      },
    },
  },
})
