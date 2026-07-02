import { eq, and, isNull, gt } from 'drizzle-orm'
import { ZodError } from 'zod'
import { db } from './db'
import { users, sessions } from './schema'
import type { User, Session } from './schema'
import { base64Encode, base64Decode } from './crypto/base64'
import { decrypt } from './crypto/envelope'

export interface AuthContext {
  user: User
  session: Session
  orgId?: string
}

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
  const hashBuffer = await crypto.subtle.digest('SHA-256', tokenBytes as BufferSource)
  const tokenHash = base64Encode(new Uint8Array(hashBuffer))

  const sessionRows = await db
    .select()
    .from(sessions)
    .where(and(
      eq(sessions.token_hash, tokenHash),
      isNull(sessions.revoked_at),
      gt(sessions.expires_at, new Date())
    ))
    .limit(1)
  const session = sessionRows[0] ?? null

  if (!session) {
    throw jsonError('Invalid or expired session', 401)
  }

  const userRows = await db.select().from(users).where(eq(users.id, session.user_id)).limit(1)
  const user = userRows[0] ?? null
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
  session: Session,
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

export function jsonError(message: string, status: number): HttpError {
  return new HttpError(status, { error: message })
}

export function errorResponse(err: unknown): Response {
  if (err instanceof HttpError) {
    return Response.json(err.body, { status: err.status })
  }
  if (err instanceof ZodError) {
    const issue = err.issues[0]
    return Response.json({ error: issue?.message ?? 'Invalid input' }, { status: 400 })
  }
  console.error('Unhandled error:', err)
  return Response.json({ error: 'Internal server error' }, { status: 500 })
}
