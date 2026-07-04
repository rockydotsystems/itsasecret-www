import { and, eq, gt, isNull } from 'drizzle-orm'
import { db } from './db'
import { emailVerifications, users } from './schema'
import { base64Decode, base64Encode } from './crypto/base64'
import { generateId } from './db-utils'

// Verification links are single-use and expire after this window.
const VERIFICATION_TTL_MS = 24 * 60 * 60 * 1000

// Build the public verification link. APP_URL wins when set (needed behind a
// reverse proxy); otherwise fall back to the request's own origin.
export function verificationUrl(request: Request, token: string): string {
  const baseUrl = process.env.APP_URL ?? new URL(request.url).origin
  return `${baseUrl}/api/auth/verify-email?token=${encodeURIComponent(token)}`
}

// Issue a verification token for a user. Only the SHA-256 hash is stored, so a
// leaked table row cannot be replayed as a valid link (same pattern as sessions).
export async function createEmailVerification(userId: string): Promise<{ token: string }> {
  const tokenBytes = crypto.getRandomValues(new Uint8Array(32))
  const token = base64Encode(tokenBytes)
  const hashBuffer = await crypto.subtle.digest('SHA-256', tokenBytes as BufferSource)
  const tokenHash = base64Encode(new Uint8Array(hashBuffer))

  await db.insert(emailVerifications).values({
    id: generateId(),
    user_id: userId,
    token_hash: tokenHash,
    expires_at: new Date(Date.now() + VERIFICATION_TTL_MS),
  })

  return { token }
}

// Consume a verification token: marks the row used and stamps the user as
// verified. Returns false for unknown, already-used, or expired tokens.
export async function consumeEmailVerification(token: string): Promise<boolean> {
  let tokenBytes: Uint8Array
  try {
    tokenBytes = base64Decode(token)
  } catch {
    return false
  }
  const hashBuffer = await crypto.subtle.digest('SHA-256', tokenBytes as BufferSource)
  const tokenHash = base64Encode(new Uint8Array(hashBuffer))

  const rows = await db
    .select()
    .from(emailVerifications)
    .where(and(
      eq(emailVerifications.token_hash, tokenHash),
      isNull(emailVerifications.verified_at),
      gt(emailVerifications.expires_at, new Date())
    ))
    .limit(1)
  const record = rows[0] ?? null
  if (!record) return false

  const now = new Date()
  await db.update(emailVerifications).set({ verified_at: now }).where(eq(emailVerifications.id, record.id))
  await db.update(users).set({ email_verified_at: now }).where(eq(users.id, record.user_id))
  return true
}
