import { encrypt, decrypt } from './crypto/envelope'
import { getOrgKeyClient } from './vault'

// Auth rides the HttpOnly session_token cookie, sent automatically on these
// same-origin requests - the bearer token is never in JS-readable storage.
function authHeaders(): Record<string, string> {
  return { 'Content-Type': 'application/json', 'X-Requested-With': 'XMLHttpRequest' }
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

export async function deleteVar(envId: string, key: string): Promise<void> {
  const resp = await fetch(`/api/envs/${envId}/vars/${encodeURIComponent(key)}`, {
    method: 'DELETE',
    headers: authHeaders(),
  })
  if (!resp.ok && resp.status !== 404) await throwResponseError(resp, 'Failed to delete variable')
}

// E2E: the value is encrypted under the org key in the browser (vault must be
// unlocked) and stored verbatim - the server never sees the plaintext.
export async function setSecret(orgId: string, envId: string, key: string, value: string): Promise<void> {
  validateItemKey(key)
  const orgKey = await getOrgKeyClient(orgId)
  const encryptedValue = await encrypt(orgKey, value)
  const resp = await fetch(`/api/envs/${envId}/secrets/${encodeURIComponent(key)}`, {
    method: 'PUT',
    headers: authHeaders(),
    body: JSON.stringify({ encryptedValue, cipher: 'org' }),
  })
  if (!resp.ok) await throwResponseError(resp, 'Failed to save secret')
}

// E2E: fetches the stored org-key ciphertext and decrypts it locally.
export async function revealSecret(orgId: string, envId: string, key: string): Promise<string> {
  const orgKey = await getOrgKeyClient(orgId)
  const resp = await fetch(`/api/envs/${envId}/secrets/${encodeURIComponent(key)}/encrypted`, {
    headers: authHeaders(),
  })
  if (!resp.ok) await throwResponseError(resp, 'Failed to fetch secret')
  const data = (await resp.json()) as { encryptedValue: string }
  return decrypt(orgKey, data.encryptedValue)
}

export type SecretHistoryEntry = {
  id: string
  change_type: string
  changed_by: string
  created_at: string
  encrypted_value: string
}

export type VarHistoryEntry = {
  id: string
  change_type: string
  changed_by: string
  created_at: string
  value: string
}

// Entries carry org-key ciphertexts; decrypt each with decryptSecretHistoryValue.
export async function fetchSecretHistory(envId: string, key: string): Promise<SecretHistoryEntry[]> {
  const resp = await fetch(`/api/envs/${envId}/secrets/${encodeURIComponent(key)}/history`, {
    headers: authHeaders(),
  })
  if (!resp.ok) await throwResponseError(resp, 'Failed to fetch history')
  return (await resp.json()) as SecretHistoryEntry[]
}

export async function decryptSecretHistoryValue(orgId: string, encryptedValue: string): Promise<string> {
  const orgKey = await getOrgKeyClient(orgId)
  return decrypt(orgKey, encryptedValue)
}

export async function fetchVarHistory(envId: string, key: string): Promise<VarHistoryEntry[]> {
  const resp = await fetch(`/api/envs/${envId}/vars/${encodeURIComponent(key)}/history`, {
    headers: authHeaders(),
  })
  if (!resp.ok) await throwResponseError(resp, 'Failed to fetch history')
  return (await resp.json()) as VarHistoryEntry[]
}

export async function deleteSecret(envId: string, key: string): Promise<void> {
  const resp = await fetch(`/api/envs/${envId}/secrets/${encodeURIComponent(key)}`, {
    method: 'DELETE',
    headers: authHeaders(),
  })
  if (!resp.ok && resp.status !== 404) await throwResponseError(resp, 'Failed to delete secret')
}

// Un-deletes a soft-deleted item in place; the stored value was never touched.
export async function restoreDeletedItem(kind: 'secret' | 'var', envId: string, key: string): Promise<void> {
  const path = kind === 'secret' ? 'secrets' : 'vars'
  const resp = await fetch(`/api/envs/${envId}/${path}/${encodeURIComponent(key)}/restore`, {
    method: 'POST',
    headers: authHeaders(),
  })
  if (!resp.ok) await throwResponseError(resp, 'Failed to restore')
}

// "Perma delete": hides a soft-deleted item from the UI. The data is still
// retained until the 90-day purge per the retention policy.
export async function hideDeletedItem(kind: 'secret' | 'var', envId: string, key: string): Promise<void> {
  const path = kind === 'secret' ? 'secrets' : 'vars'
  const resp = await fetch(`/api/envs/${envId}/${path}/${encodeURIComponent(key)}/hide`, {
    method: 'POST',
    headers: authHeaders(),
  })
  if (!resp.ok) await throwResponseError(resp, 'Failed to delete permanently')
}
