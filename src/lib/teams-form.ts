export type EnvRole = 'read' | 'write' | 'admin'

// Auth rides the HttpOnly session_token cookie, sent automatically on these
// same-origin requests - the bearer token is never in JS-readable storage.
function authHeaders(): Record<string, string> {
  return { 'Content-Type': 'application/json' }
}

async function throwResponseError(resp: Response, fallback: string): Promise<never> {
  const err = await resp.json().catch(() => ({ error: fallback }))
  throw new Error(err.error || fallback)
}

export async function createTeam(orgId: string, name: string): Promise<void> {
  const resp = await fetch(`/api/orgs/${orgId}/teams`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify({ name }),
  })
  if (!resp.ok) await throwResponseError(resp, 'Failed to create team')
}

export async function renameTeam(orgId: string, teamId: string, name: string): Promise<void> {
  const resp = await fetch(`/api/orgs/${orgId}/teams/${teamId}`, {
    method: 'PATCH',
    headers: authHeaders(),
    body: JSON.stringify({ name }),
  })
  if (!resp.ok) await throwResponseError(resp, 'Failed to rename team')
}

export async function deleteTeam(orgId: string, teamId: string): Promise<void> {
  const resp = await fetch(`/api/orgs/${orgId}/teams/${teamId}`, {
    method: 'DELETE',
    headers: authHeaders(),
  })
  if (!resp.ok) await throwResponseError(resp, 'Failed to delete team')
}

export async function addTeamMember(orgId: string, teamId: string, userId: string): Promise<void> {
  const resp = await fetch(`/api/orgs/${orgId}/teams/${teamId}/members`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify({ userId }),
  })
  if (!resp.ok) await throwResponseError(resp, 'Failed to add team member')
}

export async function removeTeamMember(orgId: string, teamId: string, userId: string): Promise<void> {
  const resp = await fetch(`/api/orgs/${orgId}/teams/${teamId}/members/${userId}`, {
    method: 'DELETE',
    headers: authHeaders(),
  })
  if (!resp.ok) await throwResponseError(resp, 'Failed to remove team member')
}

export async function grantTeamEnvPermission(envId: string, teamId: string, role: EnvRole): Promise<void> {
  const resp = await fetch(`/api/envs/${envId}/team-permissions`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify({ teamId, role }),
  })
  if (!resp.ok) await throwResponseError(resp, 'Failed to grant team access')
}

export async function changeTeamEnvPermission(envId: string, teamId: string, role: EnvRole): Promise<void> {
  const resp = await fetch(`/api/envs/${envId}/team-permissions/${teamId}`, {
    method: 'PATCH',
    headers: authHeaders(),
    body: JSON.stringify({ role }),
  })
  if (!resp.ok) await throwResponseError(resp, 'Failed to change team access')
}

export async function revokeTeamEnvPermission(envId: string, teamId: string): Promise<void> {
  const resp = await fetch(`/api/envs/${envId}/team-permissions/${teamId}`, {
    method: 'DELETE',
    headers: authHeaders(),
  })
  if (!resp.ok) await throwResponseError(resp, 'Failed to revoke team access')
}

export async function grantTeamProjectPermission(projectId: string, teamId: string, role: EnvRole): Promise<void> {
  const resp = await fetch(`/api/projects/${projectId}/team-permissions`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify({ teamId, role }),
  })
  if (!resp.ok) await throwResponseError(resp, 'Failed to grant team access')
}

export async function changeTeamProjectPermission(projectId: string, teamId: string, role: EnvRole): Promise<void> {
  const resp = await fetch(`/api/projects/${projectId}/team-permissions/${teamId}`, {
    method: 'PATCH',
    headers: authHeaders(),
    body: JSON.stringify({ role }),
  })
  if (!resp.ok) await throwResponseError(resp, 'Failed to change team access')
}

export async function revokeTeamProjectPermission(projectId: string, teamId: string): Promise<void> {
  const resp = await fetch(`/api/projects/${projectId}/team-permissions/${teamId}`, {
    method: 'DELETE',
    headers: authHeaders(),
  })
  if (!resp.ok) await throwResponseError(resp, 'Failed to revoke team access')
}
