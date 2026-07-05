import { eq, and, isNull, gt } from 'drizzle-orm'
import { db } from './db'
import { sessions, orgMembers } from './schema'
import type { Session } from './schema'
import { rotateSessionToken } from './sessions'
import { base64Encode, base64Decode } from './crypto/base64'
import { isPendingOrgKey, unwrapPendingOrgKey } from './pending-org-key'
import { encrypt } from './crypto/envelope'

// maybeRotateCliSession implements rolling CLI sessions: when an /api request
// authenticated with a CLI session's *current* token produced a successful
// response, issue a fresh token (the old one keeps a short grace window) and
// attach it to the response headers. Newly-joined orgs' keys are folded into
// the session on the way (only pending-wrapped ones can be unwrapped without
// the master password).
export async function maybeRotateCliSession(request: Request, response: Response): Promise<void> {
  if (!response.ok) return
  const authHeader = request.headers.get('Authorization')
  if (!authHeader?.startsWith('Bearer ')) return

  let tokenHash: string
  try {
    const tokenBytes = base64Decode(authHeader.slice(7))
    const hashBuffer = await crypto.subtle.digest('SHA-256', tokenBytes as BufferSource)
    tokenHash = base64Encode(new Uint8Array(hashBuffer))
  } catch {
    return
  }

  // Match on the *current* token only: a request that came in on the
  // grace-window (previous) token means rotation already happened and the
  // client simply hasn't caught up — rotating again would churn tokens.
  const rows = await db.select().from(sessions).where(and(
    eq(sessions.token_hash, tokenHash),
    eq(sessions.kind, 'cli'),
    isNull(sessions.revoked_at),
    gt(sessions.expires_at, new Date())
  )).limit(1)
  const session = rows[0]
  if (!session) return

  await refreshSessionOrgKeys(session, request)

  const { token, expiresAt } = await rotateSessionToken(session)
  response.headers.set('X-New-Session-Token', token)
  response.headers.set('X-Session-Expires-At', expiresAt.toISOString())
}

// refreshSessionOrgKeys adds keys for orgs the user joined after this session
// was created. Only pending-wrapped keys (fresh invites) are unwrappable
// server-side without the master password; keys already re-wrapped under the
// user's master key are picked up at the next full login. Needs the request's
// transport key (X-Session-Key) to encrypt the additions for this session.
async function refreshSessionOrgKeys(session: Session, request: Request): Promise<void> {
  const sessionKeyB64 = request.headers.get('X-Session-Key')
  if (!sessionKeyB64) return
  let sessionKey: Uint8Array
  try {
    sessionKey = base64Decode(sessionKeyB64)
  } catch {
    return
  }

  const known: Record<string, string> = JSON.parse(session.encrypted_org_keys)
  const memberRows = await db.select().from(orgMembers).where(eq(orgMembers.user_id, session.user_id))
  let added = false
  for (const member of memberRows) {
    if (known[member.org_id]) continue
    if (!isPendingOrgKey(member.wrapped_org_key)) continue
    const orgKey = await unwrapPendingOrgKey(member.wrapped_org_key)
    known[member.org_id] = await encrypt(sessionKey, base64Encode(orgKey))
    added = true
  }
  if (added) {
    await db.update(sessions)
      .set({ encrypted_org_keys: JSON.stringify(known) })
      .where(eq(sessions.id, session.id))
  }
}
