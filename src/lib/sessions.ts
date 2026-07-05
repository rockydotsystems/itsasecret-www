import { eq, and, isNull } from 'drizzle-orm'
import { db } from './db'
import { sessions } from './schema'
import type { Session } from './schema'
import { base64Encode } from './crypto/base64'
import { generateId } from './db-utils'

export type SessionKind = 'web' | 'cli'

export const WEB_SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000
// CLI sessions are short-lived and roll on every successful request.
export const CLI_SESSION_TTL_MS = 30 * 60 * 1000
// After a rotation, the previous token stays valid briefly so an interrupted
// CLI (or a parallel request) isn't locked out mid-window.
export const PREV_TOKEN_GRACE_MS = 60 * 1000

export function sessionTTL(kind: SessionKind): number {
  return kind === 'cli' ? CLI_SESSION_TTL_MS : WEB_SESSION_TTL_MS
}

async function newToken(): Promise<{ token: string; tokenHash: string }> {
  const tokenBytes = crypto.getRandomValues(new Uint8Array(32))
  const token = base64Encode(tokenBytes)
  const hashBuffer = await crypto.subtle.digest('SHA-256', tokenBytes)
  return { token, tokenHash: base64Encode(new Uint8Array(hashBuffer)) }
}

export async function createSession(
  userId: string,
  serverPubkey: string,
  encryptedOrgKeys: Record<string, string>,
  kind: SessionKind = 'web'
): Promise<{ token: string; sessionId: string; expiresAt: Date }> {
  const { token, tokenHash } = await newToken()
  const sessionId = generateId()
  const expiresAt = new Date(Date.now() + sessionTTL(kind))

  await db.insert(sessions).values({
    id: sessionId,
    user_id: userId,
    token_hash: tokenHash,
    kind,
    session_pubkey: serverPubkey,
    encrypted_org_keys: JSON.stringify(encryptedOrgKeys),
    created_at: new Date(),
    expires_at: expiresAt,
  })

  return { token, sessionId, expiresAt }
}

// rotateSessionToken issues a fresh token for a rolling (CLI) session and
// extends its expiry by the session TTL. The outgoing token is kept in
// prev_token_hash for a short grace window.
export async function rotateSessionToken(
  session: Session
): Promise<{ token: string; expiresAt: Date }> {
  const { token, tokenHash } = await newToken()
  const expiresAt = new Date(Date.now() + sessionTTL(session.kind as SessionKind))

  await db.update(sessions)
    .set({
      token_hash: tokenHash,
      prev_token_hash: session.token_hash,
      prev_token_expires_at: new Date(Date.now() + PREV_TOKEN_GRACE_MS),
      expires_at: expiresAt,
    })
    .where(and(eq(sessions.id, session.id), isNull(sessions.revoked_at)))

  return { token, expiresAt }
}

export async function revokeSession(sessionId: string): Promise<void> {
  await db.update(sessions).set({ revoked_at: new Date() }).where(eq(sessions.id, sessionId))
}

export async function revokeAllUserSessions(userId: string): Promise<void> {
  await db.update(sessions)
    .set({ revoked_at: new Date() })
    .where(and(eq(sessions.user_id, userId), isNull(sessions.revoked_at)))
}
