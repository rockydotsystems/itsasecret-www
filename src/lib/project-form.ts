import type { Project } from './schema'

export async function createProject(orgId: string, name: string): Promise<Project> {
  const token = localStorage.getItem('sessionToken')
  if (!token) throw new Error('Not authenticated')

  const resp = await fetch(`/api/orgs/${orgId}/projects`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ name }),
  })

  if (!resp.ok) {
    const err = await resp.json().catch(() => ({ error: 'Request failed' }))
    throw new Error(err.error || 'Failed to create project')
  }

  return (await resp.json()) as Project
}
