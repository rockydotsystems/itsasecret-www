import type { Environment } from './schema'

export type EnvRole = 'read' | 'write' | 'admin'

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

export async function renameProject(projectId: string, name: string): Promise<void> {
  const resp = await fetch(`/api/projects/${projectId}`, {
    method: 'PATCH',
    headers: authHeaders(),
    body: JSON.stringify({ name }),
  })
  if (!resp.ok) await throwResponseError(resp, 'Failed to rename project')
}

export async function deleteProject(projectId: string): Promise<void> {
  const resp = await fetch(`/api/projects/${projectId}`, {
    method: 'DELETE',
    headers: authHeaders(),
  })
  if (!resp.ok) await throwResponseError(resp, 'Failed to delete project')
}

export async function createEnvironment(projectId: string, name: string): Promise<Environment> {
  const resp = await fetch(`/api/projects/${projectId}/envs`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify({ name }),
  })
  if (!resp.ok) await throwResponseError(resp, 'Failed to create environment')
  return resp.json()
}

export async function forkEnvironment(projectId: string, envId: string, name: string): Promise<Environment> {
  const resp = await fetch(`/api/projects/${projectId}/envs/${envId}/fork`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify({ name }),
  })
  if (!resp.ok) await throwResponseError(resp, 'Failed to fork environment')
  return resp.json()
}

export async function deleteEnvironment(envId: string): Promise<void> {
  const resp = await fetch(`/api/envs/${envId}`, {
    method: 'DELETE',
    headers: authHeaders(),
  })
  if (!resp.ok) await throwResponseError(resp, 'Failed to delete environment')
}

export async function grantEnvPermission(envId: string, userId: string, role: EnvRole): Promise<void> {
  const resp = await fetch(`/api/envs/${envId}/permissions`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify({ userId, role }),
  })
  if (!resp.ok) await throwResponseError(resp, 'Failed to grant access')
}

export async function changeEnvPermission(envId: string, userId: string, role: EnvRole): Promise<void> {
  const resp = await fetch(`/api/envs/${envId}/permissions/${userId}`, {
    method: 'PATCH',
    headers: authHeaders(),
    body: JSON.stringify({ role }),
  })
  if (!resp.ok) await throwResponseError(resp, 'Failed to change access')
}

export async function revokeEnvPermission(envId: string, userId: string): Promise<void> {
  const resp = await fetch(`/api/envs/${envId}/permissions/${userId}`, {
    method: 'DELETE',
    headers: authHeaders(),
  })
  if (!resp.ok) await throwResponseError(resp, 'Failed to revoke access')
}
