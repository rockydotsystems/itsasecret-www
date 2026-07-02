import { eq, and, isNull } from 'drizzle-orm'
import { db } from './db'
import { sessions } from './schema'
import { base64Encode } from './crypto/base64'
import { generateId } from './db-utils'

export async function createSession(
  userId: string,
  serverPubkey: string,
  encryptedOrgKeys: Record<string, string>
): Promise<{ token: string; sessionId: string }> {
  const tokenBytes = crypto.getRandomValues(new Uint8Array(32))
  const token = base64Encode(tokenBytes)
  const hashBuffer = await crypto.subtle.digest('SHA-256', tokenBytes)
  const tokenHash = base64Encode(new Uint8Array(hashBuffer))
  const sessionId = generateId()

  await db.insert(sessions).values({
    id: sessionId,
    user_id: userId,
    token_hash: tokenHash,
    session_pubkey: serverPubkey,
    encrypted_org_keys: JSON.stringify(encryptedOrgKeys),
    created_at: new Date(),
    expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
  })

  return { token, sessionId }
}

export async function revokeSession(sessionId: string): Promise<void> {
  await db.update(sessions).set({ revoked_at: new Date() }).where(eq(sessions.id, sessionId))
}

export async function revokeAllUserSessions(userId: string): Promise<void> {
  await db.update(sessions)
    .set({ revoked_at: new Date() })
    .where(and(eq(sessions.user_id, userId), isNull(sessions.revoked_at)))
}
