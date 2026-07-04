import { wrapKey, unwrapKey } from './crypto/envelope'
import { getServerSecretKey } from './server-secret'

// Interim invite re-key scheme (see docs/open-questions.md #3): an inviter
// cannot wrap the org key with the invitee's master key, so the server wraps
// it under a server-side key and marks it "pending:". At the invitee's next
// login (when their master key is derivable) the pending value is unwrapped
// and re-wrapped under their master key.

const PENDING_PREFIX = 'pending:'

export function isPendingOrgKey(wrapped: string): boolean {
  return wrapped.startsWith(PENDING_PREFIX)
}

export async function wrapPendingOrgKey(orgKey: Uint8Array): Promise<string> {
  const key = await getServerSecretKey()
  return PENDING_PREFIX + (await wrapKey(key, orgKey))
}

export async function unwrapPendingOrgKey(wrapped: string): Promise<Uint8Array> {
  if (!isPendingOrgKey(wrapped)) throw new Error('Not a pending org key')
  const key = await getServerSecretKey()
  return unwrapKey(key, wrapped.slice(PENDING_PREFIX.length))
}
