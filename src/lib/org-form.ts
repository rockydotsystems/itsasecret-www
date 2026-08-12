import { base64Encode } from './crypto/base64'
import { generateKey, wrapKey, encrypt } from './crypto/envelope'
import { getClientSessionKey } from './client-session'
import { getCachedMasterKey, seedVaultFromLogin } from './vault'

export interface WorkspaceInput {
  orgName: string
  projectName: string
  envName: string
  // Fallback for when the vault is locked (e.g. the wizard runs in a fresh
  // tab): the typed password is verified against the server before it is
  // used to derive the master key.
  password?: string
}

// There is no client-side proof that a typed password is THE master password
// for a user without existing org keys (nothing to test-unwrap yet), so the
// wizard verifies server-side. Wrapping a fresh org key under a mistyped
// password would silently corrupt org_members.wrapped_org_key.
async function verifyMasterPassword(password: string): Promise<void> {
  const resp = await fetch('/api/auth/verify-password', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'XMLHttpRequest' },
    body: JSON.stringify({ password }),
  })
  if (!resp.ok) {
    const err = await resp.json().catch(() => ({ error: 'Failed to verify master password' }))
    throw new Error(err.error || 'Failed to verify master password')
  }
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
    await verifyMasterPassword(password)
    // Seed the vault with the now-proven password: the master key stays
    // cached for the rest of the browser session, like after a login.
    await seedVaultFromLogin(password)
    masterKey = await getCachedMasterKey()
    if (!masterKey) throw new Error('Master password required')
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
    headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'XMLHttpRequest' },
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
