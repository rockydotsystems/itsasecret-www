import { wrapKey, unwrapKey } from './crypto/envelope'

// Interim invite re-key scheme (see docs/open-questions.md #3): an inviter
// cannot wrap the org key with the invitee's master key, so the server wraps
// it under a server-side key and marks it "pending:". At the invitee's next
// login (when their master key is derivable) the pending value is unwrapped
// and re-wrapped under their master key.

const PENDING_PREFIX = 'pending:'

let serverWrapKey: Uint8Array | null = null

async function getServerWrapKey(): Promise<Uint8Array> {
  if (serverWrapKey) return serverWrapKey
  const secret = process.env.SERVER_WRAP_SECRET ?? 'dev-only-insecure-server-wrap-secret'
  if (!process.env.SERVER_WRAP_SECRET && process.env.NODE_ENV === 'production') {
    throw new Error('SERVER_WRAP_SECRET must be set in production')
  }
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(secret))
  serverWrapKey = new Uint8Array(digest)
  return serverWrapKey
}

export function isPendingOrgKey(wrapped: string): boolean {
  return wrapped.startsWith(PENDING_PREFIX)
}

export async function wrapPendingOrgKey(orgKey: Uint8Array): Promise<string> {
  const key = await getServerWrapKey()
  return PENDING_PREFIX + (await wrapKey(key, orgKey))
}

export async function unwrapPendingOrgKey(wrapped: string): Promise<Uint8Array> {
  if (!isPendingOrgKey(wrapped)) throw new Error('Not a pending org key')
  const key = await getServerWrapKey()
  return unwrapKey(key, wrapped.slice(PENDING_PREFIX.length))
}
