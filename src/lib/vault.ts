import { base64Encode, base64Decode } from './crypto/base64'
import { deriveKey } from './crypto/kdf'
import type { KdfParams } from './crypto/kdf'
import { unwrapKey } from './crypto/envelope'

// Client-side vault for the web E2E flow. The master password is asked for
// once per browser session; the Argon2id-derived master key (never the raw
// password) is kept encrypted in sessionStorage under a non-extractable
// runtime AES key stored in IndexedDB. Org keys are unwrapped from it locally
// — no key material is ever sent to the server.

const STORAGE_KEY = 'vaultMasterKey'
const IDB_NAME = 'itsasecret-vault'
const IDB_STORE = 'keys'
const IDB_RUNTIME_KEY_ID = 'runtime'

export class VaultLockedError extends Error {
  constructor() {
    super('Vault is locked')
    this.name = 'VaultLockedError'
  }
}

let masterKeyCache: Uint8Array | null = null
const orgKeyCache = new Map<string, Uint8Array>()

function openVaultDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(IDB_NAME, 1)
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(IDB_STORE)) {
        req.result.createObjectStore(IDB_STORE)
      }
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

function idbGet(db: IDBDatabase, id: string): Promise<CryptoKey | undefined> {
  return new Promise((resolve, reject) => {
    const req = db.transaction(IDB_STORE, 'readonly').objectStore(IDB_STORE).get(id)
    req.onsuccess = () => resolve(req.result as CryptoKey | undefined)
    req.onerror = () => reject(req.error)
  })
}

function idbPut(db: IDBDatabase, id: string, value: CryptoKey): Promise<void> {
  return new Promise((resolve, reject) => {
    const req = db.transaction(IDB_STORE, 'readwrite').objectStore(IDB_STORE).put(value, id)
    req.onsuccess = () => resolve()
    req.onerror = () => reject(req.error)
  })
}

// The runtime key encrypts the master key at rest in sessionStorage. It is
// non-extractable: it can only be used from this origin's script context, so
// the sessionStorage ciphertext alone is useless.
async function getRuntimeKey(create: boolean): Promise<CryptoKey | null> {
  const db = await openVaultDb()
  try {
    const existing = await idbGet(db, IDB_RUNTIME_KEY_ID)
    if (existing) return existing
    if (!create) return null
    const key = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt'])
    await idbPut(db, IDB_RUNTIME_KEY_ID, key)
    return key
  } finally {
    db.close()
  }
}

async function persistMasterKey(masterKey: Uint8Array): Promise<void> {
  const runtimeKey = await getRuntimeKey(true)
  if (!runtimeKey) return
  const nonce = crypto.getRandomValues(new Uint8Array(12))
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: nonce as BufferSource },
    runtimeKey,
    masterKey as BufferSource
  )
  const combined = new Uint8Array(nonce.length + ciphertext.byteLength)
  combined.set(nonce, 0)
  combined.set(new Uint8Array(ciphertext), nonce.length)
  sessionStorage.setItem(STORAGE_KEY, base64Encode(combined))
}

async function restoreMasterKey(): Promise<Uint8Array | null> {
  const stored = sessionStorage.getItem(STORAGE_KEY)
  if (!stored) return null
  try {
    const runtimeKey = await getRuntimeKey(false)
    if (!runtimeKey) return null
    const combined = base64Decode(stored)
    const plaintext = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: combined.slice(0, 12) as BufferSource },
      runtimeKey,
      combined.slice(12) as BufferSource
    )
    return new Uint8Array(plaintext)
  } catch {
    sessionStorage.removeItem(STORAGE_KEY)
    return null
  }
}

async function getMasterKey(): Promise<Uint8Array | null> {
  if (masterKeyCache) return masterKeyCache
  masterKeyCache = await restoreMasterKey()
  return masterKeyCache
}

export async function isVaultUnlocked(): Promise<boolean> {
  return (await getMasterKey()) !== null
}

// The cached master key (seeded at login), or null when the vault is locked.
// Lets onboarding wrap the first org key without re-prompting for the
// password in the tab the user just logged in from.
export async function getCachedMasterKey(): Promise<Uint8Array | null> {
  return getMasterKey()
}

function authHeader(): Record<string, string> {
  const token = localStorage.getItem('sessionToken')
  if (!token) throw new Error('Not authenticated')
  return { Authorization: `Bearer ${token}` }
}

async function fetchWrappedOrgKey(orgId: string): Promise<string> {
  const resp = await fetch(`/api/orgs/${orgId}/key`, { headers: authHeader() })
  if (!resp.ok) {
    const err = await resp.json().catch(() => ({ error: 'Failed to fetch org key' }))
    throw new Error(err.error || 'Failed to fetch org key')
  }
  const data = (await resp.json()) as { wrappedOrgKey: string }
  return data.wrappedOrgKey
}

async function fetchKdfSettings(): Promise<{ kdf_salt: string; kdf_params: string }> {
  const resp = await fetch('/api/auth/me', { headers: authHeader() })
  if (!resp.ok) throw new Error('Not authenticated')
  const data = (await resp.json()) as { user: { kdf_salt: string; kdf_params: string } }
  return data.user
}

// Called right after a successful login/register, while the password is in
// hand, so viewing secrets doesn't re-prompt in this tab. Skips the unwrap
// proof — the server just verified the password.
export async function seedVaultFromLogin(password: string): Promise<void> {
  const user = await fetchKdfSettings()
  const kdfParams: KdfParams = JSON.parse(user.kdf_params)
  const masterKey = await deriveKey(password, base64Decode(user.kdf_salt), kdfParams)
  masterKeyCache = masterKey
  orgKeyCache.clear()
  await persistMasterKey(masterKey)
}

// Derives the master key from the password, proves it by unwrapping the org
// key for orgId, then caches it for the rest of the browser session.
export async function unlockVault(password: string, orgId: string): Promise<void> {
  const user = await fetchKdfSettings()
  const kdfParams: KdfParams = JSON.parse(user.kdf_params)
  const masterKey = await deriveKey(password, base64Decode(user.kdf_salt), kdfParams)

  const wrappedOrgKey = await fetchWrappedOrgKey(orgId)
  let orgKey: Uint8Array
  try {
    orgKey = await unwrapKey(masterKey, wrappedOrgKey)
  } catch {
    throw new Error('Wrong master password')
  }

  masterKeyCache = masterKey
  orgKeyCache.set(orgId, orgKey)
  await persistMasterKey(masterKey)
}

// Resolves the org key for client-side encrypt/decrypt. Throws
// VaultLockedError when the master password has not been entered this session.
export async function getOrgKeyClient(orgId: string): Promise<Uint8Array> {
  const cached = orgKeyCache.get(orgId)
  if (cached) return cached

  const masterKey = await getMasterKey()
  if (!masterKey) throw new VaultLockedError()

  const wrappedOrgKey = await fetchWrappedOrgKey(orgId)
  let orgKey: Uint8Array
  try {
    orgKey = await unwrapKey(masterKey, wrappedOrgKey)
  } catch {
    // Stale cached key (e.g. password changed): force a fresh unlock.
    lockVault()
    throw new VaultLockedError()
  }
  orgKeyCache.set(orgId, orgKey)
  return orgKey
}

export function lockVault(): void {
  masterKeyCache = null
  orgKeyCache.clear()
  try {
    sessionStorage.removeItem(STORAGE_KEY)
  } catch {
    // sessionStorage unavailable (SSR): nothing to clear.
  }
}
