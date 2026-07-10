import { base64Encode } from './crypto/base64'
import { deriveSessionKey } from './crypto/ecdh'

// The per-session ECDH private key lives as a NON-EXTRACTABLE CryptoKey in
// IndexedDB (same protection the vault uses for its runtime key): script on
// this origin can use it to derive the transport key, but its raw bytes can
// never be read back out - so an XSS can't exfiltrate it the way it could a
// pkcs8 blob sitting in localStorage. The server's session public key is not
// secret and stays in localStorage.
const IDB_NAME = 'itsasecret-vault'
const IDB_STORE = 'keys'
const ECDH_PRIV_KEY_ID = 'ecdhPriv'

function openDb(): Promise<IDBDatabase> {
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

function idbDelete(db: IDBDatabase, id: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const req = db.transaction(IDB_STORE, 'readwrite').objectStore(IDB_STORE).delete(id)
    req.onsuccess = () => resolve()
    req.onerror = () => reject(req.error)
  })
}

// Persist the login-time ECDH private key. It must have been generated
// non-extractable so it can be stored without ever exposing its bytes.
export async function storeClientPrivateKey(privateKey: CryptoKey): Promise<void> {
  const db = await openDb()
  try {
    await idbPut(db, ECDH_PRIV_KEY_ID, privateKey)
  } finally {
    db.close()
  }
}

export async function clearClientPrivateKey(): Promise<void> {
  const db = await openDb()
  try {
    await idbDelete(db, ECDH_PRIV_KEY_ID)
  } finally {
    db.close()
  }
}

// Derives the per-session transport key from the stored (non-extractable)
// ECDH private key and the server's session public key.
export async function getClientSessionKey(): Promise<Uint8Array> {
  const serverPubkey = localStorage.getItem('serverPubkey')
  if (!serverPubkey) throw new Error('Session key not available')

  const db = await openDb()
  let privateKey: CryptoKey | undefined
  try {
    privateKey = await idbGet(db, ECDH_PRIV_KEY_ID)
  } finally {
    db.close()
  }
  if (!privateKey) throw new Error('Session key not available')

  return deriveSessionKey(privateKey, serverPubkey)
}

export function getSessionKeyHeader(sessionKey: Uint8Array): string {
  return base64Encode(sessionKey)
}
