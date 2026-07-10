import { eq, and, isNull, gt, or } from 'drizzle-orm'
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

// Pulls the bearer token from either the Authorization header (CLI, and web
// requests that still set it) or the HttpOnly session_token cookie (the web
// app, which no longer keeps the token in JS-readable storage). Header wins so
// a CLI token is never shadowed by a stale browser cookie on the same request.
export function extractSessionToken(request: Request): string | null {
  const authHeader = request.headers.get('Authorization')
  if (authHeader && authHeader.startsWith('Bearer ')) {
    return authHeader.slice(7)
  }
  const cookieHeader = request.headers.get('cookie')
  if (cookieHeader) {
    for (const part of cookieHeader.split(';')) {
      const eq = part.indexOf('=')
      if (eq === -1) continue
      if (part.slice(0, eq).trim() !== 'session_token') continue
      const raw = part.slice(eq + 1).trim()
      try {
        return decodeURIComponent(raw)
      } catch {
        return raw
      }
    }
  }
  return null
}

export async function requireAuth(
  request: Request,
  opts: { allowUnverified?: boolean } = {}
): Promise<AuthContext> {
  const token = extractSessionToken(request)
  if (!token) {
    throw jsonError('Missing or invalid session credentials', 401)
  }
  let tokenBytes: Uint8Array
  try {
    tokenBytes = base64Decode(token)
  } catch {
    throw jsonError('Invalid token format', 401)
  }
  const hashBuffer = await crypto.subtle.digest('SHA-256', tokenBytes as BufferSource)
  const tokenHash = base64Encode(new Uint8Array(hashBuffer))

  // Rolling (CLI) sessions rotate their token on every successful request;
  // the immediately-previous token is honored for a short grace window so an
  // interrupted client isn't locked out.
  const now = new Date()
  const sessionRows = await db
    .select()
    .from(sessions)
    .where(and(
      or(
        eq(sessions.token_hash, tokenHash),
        and(
          eq(sessions.prev_token_hash, tokenHash),
          gt(sessions.prev_token_expires_at, now)
        )
      ),
      isNull(sessions.revoked_at),
      gt(sessions.expires_at, now)
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

  // Lock the app to verified accounts. Every protected endpoint funnels through
  // requireAuth, so this one check gates the whole API by default. Endpoints
  // that must stay reachable while unverified (me, logout, resend) opt out.
  if (!opts.allowUnverified && user.email_verified_at === null) {
    throw jsonError('Email not verified. Check your inbox for a verification link.', 403)
  }

  return { user, session }
}

export function getSessionKey(headerValue: string | null): Uint8Array {
  if (!headerValue) throw jsonError('Missing X-Session-Key header', 400)
  try {
    return base64Decode(headerValue)
  } catch {
    throw jsonError('Invalid X-Session-Key header', 400)
  }
}

export async function getOrgKey(
  session: Session,
  sessionKey: Uint8Array,
  orgId: string
): Promise<Uint8Array> {
  let encryptedOrgKeys: Record<string, string>
  try {
    encryptedOrgKeys = JSON.parse(session.encrypted_org_keys)
  } catch {
    throw jsonError('Session has corrupted org key data', 500)
  }
  const encryptedOrgKey = encryptedOrgKeys[orgId]
  if (!encryptedOrgKey) throw jsonError('No org key for this organization', 403)
  try {
    const orgKeyB64 = await decrypt(sessionKey, encryptedOrgKey)
    return base64Decode(orgKeyB64)
  } catch {
    throw jsonError('Failed to decrypt org key', 403)
  }
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

const KEY_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/
export function validateKey(key: string): void {
  if (!KEY_PATTERN.test(key)) {
    throw jsonError('Invalid key: must be a valid identifier (letters, digits, underscore; not starting with a digit)', 400)
  }
}

export async function getCurrentUserFromRequest(request: Request): Promise<User | null> {
  try {
    // Identity lookup only - verification is enforced by callers/route guards
    // so this can still resolve who an unverified user is.
    const { user } = await requireAuth(request, { allowUnverified: true })
    return user
  } catch {
    return null
  }
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
