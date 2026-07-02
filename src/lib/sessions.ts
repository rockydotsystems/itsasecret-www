import { db } from './db'
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

  await db.prepare(
    `INSERT INTO sessions (id, user_id, token_hash, session_pubkey, encrypted_org_keys, created_at, expires_at)
     VALUES (?, ?, ?, ?, ?, datetime('now'), datetime('now', '+30 days'))`
  ).bind(
    sessionId,
    userId,
    tokenHash,
    serverPubkey,
    JSON.stringify(encryptedOrgKeys)
  ).run()

  return { token, sessionId }
}

export async function revokeSession(sessionId: string): Promise<void> {
  await db.prepare(
    `UPDATE sessions SET revoked_at = datetime('now') WHERE id = ?`
  ).bind(sessionId).run()
}

export async function revokeAllUserSessions(userId: string): Promise<void> {
  await db.prepare(
    `UPDATE sessions SET revoked_at = datetime('now') WHERE user_id = ? AND revoked_at IS NULL`
  ).bind(userId).run()
}
