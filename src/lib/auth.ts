import { db } from './db'
import { base64Encode, base64Decode } from './crypto/base64'
import { decrypt } from './crypto/envelope'
import type { UserRow, SessionRow, AuthContext } from './types'

export async function requireAuth(request: Request): Promise<AuthContext> {
  const authHeader = request.headers.get('Authorization')
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    throw jsonError('Missing or invalid Authorization header', 401)
  }
  const token = authHeader.slice(7)
  let tokenBytes: Uint8Array
  try {
    tokenBytes = base64Decode(token)
  } catch {
    throw jsonError('Invalid token format', 401)
  }
  const hashBuffer = await crypto.subtle.digest('SHA-256', tokenBytes)
  const tokenHash = base64Encode(new Uint8Array(hashBuffer))

  const session = await db.prepare(
    `SELECT * FROM sessions WHERE token_hash = ? AND revoked_at IS NULL AND expires_at > datetime('now')`
  ).bind(tokenHash).first<SessionRow>()

  if (!session) {
    throw jsonError('Invalid or expired session', 401)
  }

  const user = await db.prepare('SELECT * FROM users WHERE id = ?').bind(session.user_id).first<UserRow>()
  if (!user) {
    throw jsonError('User not found', 401)
  }

  return { user, session }
}

export function getSessionKey(headerValue: string | null): Uint8Array {
  if (!headerValue) throw jsonError('Missing X-Session-Key header', 400)
  return base64Decode(headerValue)
}

export async function getOrgKey(
  session: SessionRow,
  sessionKey: Uint8Array,
  orgId: string
): Promise<Uint8Array> {
  const encryptedOrgKeys: Record<string, string> = JSON.parse(session.encrypted_org_keys)
  const encryptedOrgKey = encryptedOrgKeys[orgId]
  if (!encryptedOrgKey) throw jsonError('No org key for this organization', 403)
  const orgKeyB64 = await decrypt(sessionKey, encryptedOrgKey)
  return base64Decode(orgKeyB64)
}

export class HttpError extends Error {
  constructor(
    public status: number,
    public body: { error: string }
  ) {
    super(body.error)
  }
}

function jsonError(message: string, status: number): HttpError {
  return new HttpError(status, { error: message })
}

export function errorResponse(err: unknown): Response {
  if (err instanceof HttpError) {
    return Response.json(err.body, { status: err.status })
  }
  console.error('Unhandled error:', err)
  return Response.json({ error: 'Internal server error' }, { status: 500 })
}
