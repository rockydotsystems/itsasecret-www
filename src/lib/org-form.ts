import { base64Encode, base64Decode } from './crypto/base64'
import { deriveKey, type KdfParams } from './crypto/kdf'
import { generateKey, wrapKey, encrypt } from './crypto/envelope'
import { getCurrentUser } from './auth-form'
import { getClientSessionKey } from './client-session'
import { getCachedMasterKey } from './vault'
import type { Org } from './schema'

export interface CreateOrgResult {
  org: Org
  encryptedOrgKey: string
}

export async function createOrganization(name: string, password: string): Promise<CreateOrgResult> {
  const token = localStorage.getItem('sessionToken')
  if (!token) throw new Error('Not authenticated')

  const sessionKey = await getClientSessionKey()

  const user = await getCurrentUser()
  if (!user) throw new Error('Not authenticated')

  const kdfParams: KdfParams = JSON.parse(user.kdf_params)
  const kdfSalt = base64Decode(user.kdf_salt)
  const masterKey = await deriveKey(password, kdfSalt, kdfParams)

  const orgKey = generateKey()
  const wrappedOrgKey = await wrapKey(masterKey, orgKey)

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

export interface OnboardingInput {
  orgName: string
  projectName: string
  envName: string
  // Fallback for when the vault is locked (e.g. the wizard runs in a fresh
  // tab): derive the master key from the typed password, like CreateOrgForm.
  password?: string
}

export async function completeOnboarding(input: OnboardingInput): Promise<{ orgId: string; projectId: string }> {
  const token = localStorage.getItem('sessionToken')
  if (!token) throw new Error('Not authenticated')

  const sessionKey = await getClientSessionKey()

  let masterKey = await getCachedMasterKey()
  if (!masterKey) {
    if (!input.password) throw new Error('Master password required')
    const user = await getCurrentUser()
    if (!user) throw new Error('Not authenticated')
    const kdfParams: KdfParams = JSON.parse(user.kdf_params)
    masterKey = await deriveKey(input.password, base64Decode(user.kdf_salt), kdfParams)
  }

  const orgKey = generateKey()
  const wrappedOrgKey = await wrapKey(masterKey, orgKey)
  const encryptedOrgKey = await encrypt(sessionKey, base64Encode(orgKey))

  const resp = await fetch('/api/onboarding', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      orgName: input.orgName,
      projectName: input.projectName,
      envName: input.envName,
      wrappedOrgKey,
      encryptedOrgKey,
    }),
  })

  if (!resp.ok) {
    const err = await resp.json().catch(() => ({ error: 'Request failed' }))
    throw new Error(err.error || 'Failed to set up your workspace')
  }

  const result = (await resp.json()) as { orgId: string; projectId: string }

  const storedOrgKeys = localStorage.getItem('orgKeys')
  const orgKeys: Record<string, string> = storedOrgKeys ? JSON.parse(storedOrgKeys) : {}
  orgKeys[result.orgId] = encryptedOrgKey
  localStorage.setItem('orgKeys', JSON.stringify(orgKeys))

  return result
}
