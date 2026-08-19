import { eq, and, isNull, gt, or } from 'drizzle-orm'
import { ZodError } from 'zod'
import { db } from './db'
import { users, sessions } from './schema'
import type { User, Session } from './schema'
import { base64Encode, base64Decode } from './crypto/base64'
import { decrypt } from './crypto/envelope'
import { SESSION_COOKIE_NAME, SESSION_COOKIE_NAME_INSECURE, isProduction } from './session-cookie'
import { revokeSession, WEB_IDLE_TIMEOUT_MS } from './sessions'
import { StripeApiError } from './stripe'

export interface AuthContext {
  user: User
  session: Session
  orgId?: string
}

// Pulls the bearer token from either the Authorization header (CLI, and web
// requests that still set it) or the HttpOnly __Host-session_token cookie (the
// web app, which no longer keeps the token in JS-readable storage). Header wins so
// a CLI token is never shadowed by a stale browser cookie on the same request.
export function extractSessionToken(request: Request): string | null {
  const authHeader = request.headers.get('Authorization')
  if (authHeader && authHeader.startsWith('Bearer ')) {
    return authHeader.slice(7)
  }
  const cookieHeader = request.headers.get('cookie')
  if (cookieHeader) {
    let insecure: string | null = null
    // In production only the __Host- cookie is honored; the unprefixed
    // name is a plain-HTTP dev transport an attacker must not fall back to.
    const allowInsecureCookie = !isProduction()
    for (const part of cookieHeader.split(';')) {
      const eq = part.indexOf('=')
      if (eq === -1) continue
      const name = part.slice(0, eq).trim()
      if (name !== SESSION_COOKIE_NAME && name !== SESSION_COOKIE_NAME_INSECURE) continue
      let value = part.slice(eq + 1).trim()
      try {
        value = decodeURIComponent(value)
      } catch { /* keep raw */ }
      if (name === SESSION_COOKIE_NAME) return value
      if (allowInsecureCookie) insecure = value
    }
    return insecure
  }
  return null
}

export async function requireAuth(
  request: Request,
  opts: { allowUnverified?: boolean; allowNoRecovery?: boolean } = {}
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

  // Web sessions idle out after a day unused (cli is bounded by its 30-min
  // roll; tokens are long-lived by design).
  if (
    session.kind === 'web' &&
    now.getTime() - (session.last_used_at ?? session.created_at).getTime() > WEB_IDLE_TIMEOUT_MS
  ) {
    await revokeSession(session.id)
    throw jsonError('Invalid or expired session', 401)
  }

  // Throttled touch off the critical path: one write per minute per session.
  if (!session.last_used_at || now.getTime() - session.last_used_at.getTime() > 60 * 1000) {
    void db.update(sessions).set({ last_used_at: now }).where(eq(sessions.id, session.id)).catch(() => {})
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

  // Legacy accounts (created before recovery phrases) must generate one before
  // they can do anything else. The phrase is created while authenticated, so
  // "only a logged-in person can regenerate" holds from the very first phrase.
  // Endpoints needed to perform the setup itself opt out.
  if (!opts.allowNoRecovery && user.recovery_phrase_hash === null) {
    throw jsonError('Recovery phrase setup required.', 403)
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
const KEY_MAX_LENGTH = 256
// Keys become JSON object members; these names would hijack the prototype chain.
const RESERVED_KEY_NAMES = new Set(['__proto__', 'prototype', 'constructor'])
export function validateKey(key: string): void {
  if (key.length > KEY_MAX_LENGTH || RESERVED_KEY_NAMES.has(key) || !KEY_PATTERN.test(key)) {
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
  // Stripe errors surface to the owner/admin running checkout - the message
  // ("No such price", "Invalid API Key") is the fastest path to fixing a
  // misconfiguration; Stripe never includes secrets in error bodies.
  if (err instanceof StripeApiError) {
    return Response.json({ error: err.message }, { status: 502 })
  }
  console.error('Unhandled error:', err)
  return Response.json({ error: 'Internal server error' }, { status: 500 })
}
