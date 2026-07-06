import { and, eq, gt, isNull } from 'drizzle-orm'
import { db } from './db'
import { orgInvites } from './schema'
import { base64Decode, base64Encode } from './crypto/base64'
import { generateId } from './db-utils'
import type { OrgInvite } from './schema'

// Invite links are single-use and expire after this window.
export const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000

// Invite emails are matched case-insensitively: normalized once here, at
// creation, so re-invite dedup and accept-time comparison stay simple.
export function normalizeInviteEmail(email: string): string {
  return email.trim().toLowerCase()
}

// Build the public accept link. APP_URL wins when set (needed behind a
// reverse proxy); otherwise fall back to the request's own origin.
export function inviteAcceptUrl(request: Request, token: string): string {
  const baseUrl = process.env.APP_URL ?? new URL(request.url).origin
  return `${baseUrl}/invite?token=${encodeURIComponent(token)}`
}

async function hashToken(tokenBytes: Uint8Array): Promise<string> {
  const hashBuffer = await crypto.subtle.digest('SHA-256', tokenBytes as BufferSource)
  return base64Encode(new Uint8Array(hashBuffer))
}

// Issue an invite token. Only the SHA-256 hash is stored, so a leaked table
// row cannot be replayed as a valid link (same pattern as sessions). Any
// previous pending invite for the same org+email is revoked first, so
// re-inviting someone doubles as "resend with a fresh link".
export async function createOrgInvite(args: {
  orgId: string
  email: string
  role: string
  invitedBy: string
  wrappedOrgKey: string
}): Promise<{ token: string }> {
  const tokenBytes = crypto.getRandomValues(new Uint8Array(32))
  const token = base64Encode(tokenBytes)
  const tokenHash = await hashToken(tokenBytes)
  const email = normalizeInviteEmail(args.email)

  await revokePendingInvitesForEmail(args.orgId, email)
  await db.insert(orgInvites).values({
    id: generateId(),
    org_id: args.orgId,
    email,
    role: args.role,
    token_hash: tokenHash,
    wrapped_org_key: args.wrappedOrgKey,
    invited_by: args.invitedBy,
    expires_at: new Date(Date.now() + INVITE_TTL_MS),
  })

  return { token }
}

export async function revokePendingInvitesForEmail(orgId: string, email: string): Promise<void> {
  await db.update(orgInvites).set({ revoked_at: new Date() })
    .where(and(
      eq(orgInvites.org_id, orgId),
      eq(orgInvites.email, normalizeInviteEmail(email)),
      isNull(orgInvites.accepted_at),
      isNull(orgInvites.revoked_at)
    ))
}

// Look up a live (pending, unrevoked, unexpired) invite by its emailed token.
export async function findPendingInviteByToken(token: string): Promise<OrgInvite | null> {
  let tokenBytes: Uint8Array
  try {
    tokenBytes = base64Decode(token)
  } catch {
    return null
  }
  const tokenHash = await hashToken(tokenBytes)

  const rows = await db.select().from(orgInvites)
    .where(and(
      eq(orgInvites.token_hash, tokenHash),
      isNull(orgInvites.accepted_at),
      isNull(orgInvites.revoked_at),
      gt(orgInvites.expires_at, new Date())
    ))
    .limit(1)
  return rows[0] ?? null
}
