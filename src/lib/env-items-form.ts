import { encrypt } from './crypto/envelope'
import { getClientSessionKey, getSessionKeyHeader } from './client-session'

function authHeaders(): Record<string, string> {
  const token = localStorage.getItem('sessionToken')
  if (!token) throw new Error('Not authenticated')
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token}`,
  }
}

async function throwResponseError(resp: Response, fallback: string): Promise<never> {
  const err = await resp.json().catch(() => ({ error: fallback }))
  throw new Error(err.error || fallback)
}

const KEY_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/

export function validateItemKey(key: string): void {
  if (!KEY_PATTERN.test(key)) {
    throw new Error('Keys must look like env var names: letters, digits, and underscores, not starting with a digit')
  }
}

export async function setVar(envId: string, key: string, value: string): Promise<void> {
  validateItemKey(key)
  const resp = await fetch(`/api/envs/${envId}/vars/${encodeURIComponent(key)}`, {
    method: 'PUT',
    headers: authHeaders(),
    body: JSON.stringify({ value }),
  })
  if (!resp.ok) await throwResponseError(resp, 'Failed to save variable')
}

// The value is encrypted with the per-session transport key before it leaves
// the browser; the server re-encrypts it under the org key at rest.
export async function setSecret(envId: string, key: string, value: string): Promise<void> {
  validateItemKey(key)
  const sessionKey = await getClientSessionKey()
  const encryptedValue = await encrypt(sessionKey, value)
  const resp = await fetch(`/api/envs/${envId}/secrets/${encodeURIComponent(key)}`, {
    method: 'PUT',
    headers: {
      ...authHeaders(),
      'X-Session-Key': getSessionKeyHeader(sessionKey),
    },
    body: JSON.stringify({ encryptedValue }),
  })
  if (!resp.ok) await throwResponseError(resp, 'Failed to save secret')
}
