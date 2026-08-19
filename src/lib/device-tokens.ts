import { eq, and, isNull, gt } from 'drizzle-orm'
import { db } from './db'
import { deviceTokens } from './schema'
import type { DeviceToken } from './schema'
import { generateId } from './db-utils'
import { base64Encode, base64Decode } from './crypto/base64'

// Device tokens are the bearer a client presents on login once it has proven
// the recovery phrase. They are random 256-bit strings, hashed like session
// tokens, and never carry key material - losing one only re-prompts for the
// phrase on that device after revocation/expiry.
export const DEVICE_TOKEN_TTL_MS = 365 * 24 * 60 * 60 * 1000
// Trust is activity-based: an untouched device stops counting after this long,
// which implements "first time in a while".
export const DEVICE_TRUST_IDLE_MS = 90 * 24 * 60 * 60 * 1000

export async function newBearerToken(): Promise<{ token: string; tokenHash: string }> {
  const tokenBytes = crypto.getRandomValues(new Uint8Array(32))
  const token = base64Encode(tokenBytes)
  const hashBuffer = await crypto.subtle.digest('SHA-256', tokenBytes)
  return { token, tokenHash: base64Encode(new Uint8Array(hashBuffer)) }
}

export async function hashToken(token: string): Promise<string> {
  let tokenBytes: Uint8Array
  try {
    tokenBytes = base64Decode(token)
  } catch {
    return ''
  }
  const hashBuffer = await crypto.subtle.digest('SHA-256', tokenBytes as BufferSource)
  return base64Encode(new Uint8Array(hashBuffer))
}

export async function createDeviceToken(
  userId: string,
  devicePubkey: string,
): Promise<{ token: string; expiresAt: Date }> {
  const { token, tokenHash } = await newBearerToken()
  const expiresAt = new Date(Date.now() + DEVICE_TOKEN_TTL_MS)
  await db.insert(deviceTokens).values({
    id: generateId(),
    user_id: userId,
    token_hash: tokenHash,
    device_pubkey: devicePubkey,
    created_at: new Date(),
    last_used_at: new Date(),
    expires_at: expiresAt,
  })
  return { token, expiresAt }
}

// findLiveDeviceToken resolves a presented bearer to its row. Trust is
// activity-based: a device idle longer than DEVICE_TRUST_IDLE_MS counts as
// untrusted even before the token's absolute expiry, implementing "first time
// in a while". last_used_at is touched the same way sessions are - at most
// once per minute, off the critical path.
export async function findLiveDeviceToken(token: string): Promise<DeviceToken | null> {
  const tokenHash = await hashToken(token)
  if (!tokenHash) return null
  const now = new Date()
  const rows = await db
    .select()
    .from(deviceTokens)
    .where(and(
      eq(deviceTokens.token_hash, tokenHash),
      isNull(deviceTokens.revoked_at),
      gt(deviceTokens.expires_at, now),
      gt(deviceTokens.last_used_at, new Date(now.getTime() - DEVICE_TRUST_IDLE_MS)),
    ))
    .limit(1)
  const row = rows[0] ?? null
  if (row && now.getTime() - row.last_used_at.getTime() > 60 * 1000) {
    void db.update(deviceTokens).set({ last_used_at: now }).where(eq(deviceTokens.id, row.id)).catch(() => {})
  }
  return row
}
