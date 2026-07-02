import { base64Encode, base64Decode } from './crypto/base64'
import { deriveKey, type KdfParams } from './crypto/kdf'
import { deriveSessionKey } from './crypto/ecdh'
import { generateKey, wrapKey, encrypt } from './crypto/envelope'
import { getCurrentUser } from './auth-form'
import type { Org } from './schema'

export interface CreateOrgResult {
  org: Org
  encryptedOrgKey: string
}

export async function createOrganization(name: string, password: string): Promise<CreateOrgResult> {
  const token = localStorage.getItem('sessionToken')
  if (!token) throw new Error('Not authenticated')

  const ecdhPrivKeyB64 = localStorage.getItem('ecdhPrivKey')
  if (!ecdhPrivKeyB64) throw new Error('Session key not available')

  const serverPubkey = localStorage.getItem('serverPubkey')
  if (!serverPubkey) throw new Error('Session key not available')

  const user = await getCurrentUser()
  if (!user) throw new Error('Not authenticated')

  const kdfParams: KdfParams = JSON.parse(user.kdf_params)
  const kdfSalt = base64Decode(user.kdf_salt)
  const masterKey = await deriveKey(password, kdfSalt, kdfParams)

  const orgKey = generateKey()
  const wrappedOrgKey = await wrapKey(masterKey, orgKey)

  const rawPriv = base64Decode(ecdhPrivKeyB64)
  const privateKey = await crypto.subtle.importKey(
    'pkcs8',
    rawPriv as BufferSource,
    { name: 'ECDH', namedCurve: 'P-256' },
    false,
    ['deriveBits']
  )
  const sessionKey = await deriveSessionKey(privateKey, serverPubkey)
  const encryptedOrgKey = await encrypt(sessionKey, base64Encode(orgKey))

  const resp = await fetch('/api/orgs/', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      name,
      wrappedOrgKey,
      encryptedOrgKey,
    }),
  })

  if (!resp.ok) {
    const err = await resp.json().catch(() => ({ error: 'Request failed' }))
    throw new Error(err.error || 'Failed to create organization')
  }

  const org = (await resp.json()) as Org

  const storedOrgKeys = localStorage.getItem('orgKeys')
  const orgKeys: Record<string, string> = storedOrgKeys ? JSON.parse(storedOrgKeys) : {}
  orgKeys[org.id] = encryptedOrgKey
  localStorage.setItem('orgKeys', JSON.stringify(orgKeys))

  return { org, encryptedOrgKey }
}
