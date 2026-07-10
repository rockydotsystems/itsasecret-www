import { base64Encode, base64Decode } from './crypto/base64'
import { deriveKey, type KdfParams } from './crypto/kdf'
import { generateKey, wrapKey, encrypt } from './crypto/envelope'
import { getCurrentUser } from './auth-form'
import { getClientSessionKey } from './client-session'
import { getCachedMasterKey } from './vault'

export interface WorkspaceInput {
  orgName: string
  projectName: string
  envName: string
  // Fallback for when the vault is locked (e.g. the wizard runs in a fresh
  // tab): derive the master key from the typed password.
  password?: string
}

export interface WorkspaceResult {
  orgId: string
  projectId: string
}

// Generates a fresh org key, wrapped under the master key (for org_members)
// and encrypted under the session transport key (for the session row).
async function buildOrgKeyMaterial(password?: string): Promise<{ wrappedOrgKey: string; encryptedOrgKey: string }> {
  const sessionKey = await getClientSessionKey()

  let masterKey = await getCachedMasterKey()
  if (!masterKey) {
    if (!password) throw new Error('Master password required')
    const user = await getCurrentUser()
    if (!user) throw new Error('Not authenticated')
    const kdfParams: KdfParams = JSON.parse(user.kdf_params)
    masterKey = await deriveKey(password, base64Decode(user.kdf_salt), kdfParams)
  }

  const orgKey = generateKey()
  const wrappedOrgKey = await wrapKey(masterKey, orgKey)
  const encryptedOrgKey = await encrypt(sessionKey, base64Encode(orgKey))
  return { wrappedOrgKey, encryptedOrgKey }
}

// Authenticated by the HttpOnly session_token cookie (same-origin request).
async function postJson(url: string, body: unknown, fallbackError: string): Promise<any> {
  const resp = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!resp.ok) {
    const err = await resp.json().catch(() => ({ error: fallbackError }))
    throw new Error(err.error || fallbackError)
  }
  return resp.json()
}

// First-workspace setup after email verification: personal org + first
// project + first environment via the one-shot onboarding endpoint.
export async function completeOnboarding(input: WorkspaceInput): Promise<WorkspaceResult> {
  const { wrappedOrgKey, encryptedOrgKey } = await buildOrgKeyMaterial(input.password)

  return (await postJson('/api/onboarding', {
    orgName: input.orgName,
    projectName: input.projectName,
    envName: input.envName,
    wrappedOrgKey,
    encryptedOrgKey,
  }, 'Failed to set up your workspace')) as WorkspaceResult
}

// "+ New org" from the dashboard: shared org + its first project/environment.
export async function createOrgWorkspace(input: WorkspaceInput): Promise<WorkspaceResult> {
  const { wrappedOrgKey, encryptedOrgKey } = await buildOrgKeyMaterial(input.password)

  const result = (await postJson('/api/orgs/', {
    name: input.orgName,
    projectName: input.projectName,
    envName: input.envName,
    wrappedOrgKey,
    encryptedOrgKey,
  }, 'Failed to create organization')) as { org: { id: string }; projectId: string }

  return { orgId: result.org.id, projectId: result.projectId }
}
