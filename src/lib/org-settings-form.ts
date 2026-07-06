import { getClientSessionKey, getSessionKeyHeader } from './client-session'

export type MemberRole = 'admin' | 'member'

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

export async function renameOrg(orgId: string, name: string): Promise<void> {
  const resp = await fetch(`/api/orgs/${orgId}`, {
    method: 'PATCH',
    headers: authHeaders(),
    body: JSON.stringify({ name }),
  })
  if (!resp.ok) await throwResponseError(resp, 'Failed to rename organization')
}

export async function transferOrgOwnership(orgId: string, newOwnerUserId: string): Promise<void> {
  const resp = await fetch(`/api/orgs/${orgId}`, {
    method: 'PATCH',
    headers: authHeaders(),
    body: JSON.stringify({ ownerUserId: newOwnerUserId }),
  })
  if (!resp.ok) await throwResponseError(resp, 'Failed to transfer ownership')
}

export async function deleteOrg(orgId: string): Promise<void> {
  const resp = await fetch(`/api/orgs/${orgId}`, {
    method: 'DELETE',
    headers: authHeaders(),
  })
  if (!resp.ok) await throwResponseError(resp, 'Failed to delete organization')
}

export async function inviteMember(orgId: string, email: string, role: MemberRole): Promise<void> {
  const sessionKey = await getClientSessionKey()
  const resp = await fetch(`/api/orgs/${orgId}/invite`, {
    method: 'POST',
    headers: {
      ...authHeaders(),
      'X-Session-Key': getSessionKeyHeader(sessionKey),
    },
    body: JSON.stringify({ email, role }),
  })
  if (!resp.ok) await throwResponseError(resp, 'Failed to invite member')
}

export async function revokeInvite(orgId: string, inviteId: string): Promise<void> {
  const resp = await fetch(`/api/orgs/${orgId}/invites/${inviteId}`, {
    method: 'DELETE',
    headers: authHeaders(),
  })
  if (!resp.ok) await throwResponseError(resp, 'Failed to revoke invite')
}

export async function changeMemberRole(orgId: string, userId: string, role: MemberRole): Promise<void> {
  const resp = await fetch(`/api/orgs/${orgId}/members/${userId}`, {
    method: 'PATCH',
    headers: authHeaders(),
    body: JSON.stringify({ role }),
  })
  if (!resp.ok) await throwResponseError(resp, 'Failed to change role')
}

export async function removeMember(orgId: string, userId: string): Promise<void> {
  const resp = await fetch(`/api/orgs/${orgId}/members/${userId}`, {
    method: 'DELETE',
    headers: authHeaders(),
  })
  if (!resp.ok) await throwResponseError(resp, 'Failed to remove member')
}
