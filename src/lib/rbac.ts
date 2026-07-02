import { db } from './db'
import { HttpError } from './auth'
import type { OrgMemberRow, EnvRow, ProjectRow, EnvPermissionRow, UserRow, SessionRow } from './types'

export const ORG_ROLE_OWNER = 'owner'
export const ORG_ROLE_ADMIN = 'admin'
export const ORG_ROLE_MEMBER = 'member'

export const ROLE_READ = 'read'
export const ROLE_WRITE = 'write'
export const ROLE_ADMIN = 'admin'

export async function resolveOrgId(params: Record<string, string | undefined>): Promise<string> {
  let orgId = params.orgId

  if (!orgId) {
    const projectId = params.projectId
    const envId = params.envId

    if (projectId) {
      const project = await db.prepare(
        'SELECT org_id FROM projects WHERE id = ? AND deleted_at IS NULL'
      ).bind(projectId).first<{ org_id: string }>()
      if (!project) throw new HttpError(404, { error: 'Project not found' })
      orgId = project.org_id
    } else if (envId) {
      const env = await db.prepare(
        'SELECT project_id FROM environments WHERE id = ? AND deleted_at IS NULL'
      ).bind(envId).first<{ project_id: string }>()
      if (!env) throw new HttpError(404, { error: 'Environment not found' })
      const project = await db.prepare(
        'SELECT org_id FROM projects WHERE id = ? AND deleted_at IS NULL'
      ).bind(env.project_id).first<{ org_id: string }>()
      if (!project) throw new HttpError(404, { error: 'Project not found' })
      orgId = project.org_id
    }
  }

  if (!orgId) throw new HttpError(404, { error: 'Organization not found' })
  return orgId
}

export async function requireOrgRole(
  params: Record<string, string | undefined>,
  userId: string,
  allowedRoles: string[]
): Promise<string> {
  const orgId = await resolveOrgId(params)

  const member = await db.prepare(
    'SELECT * FROM org_members WHERE org_id = ? AND user_id = ?'
  ).bind(orgId, userId).first<OrgMemberRow>()

  if (!member) throw new HttpError(403, { error: 'Not a member of this organization' })
  if (!allowedRoles.includes(member.role)) {
    throw new HttpError(403, { error: 'Insufficient permissions' })
  }

  return orgId
}

export async function requireEnvRole(
  params: Record<string, string | undefined>,
  userId: string,
  allowedRoles: string[]
): Promise<string> {
  const envId = params.envId
  if (!envId) throw new HttpError(400, { error: 'Environment ID required' })

  const env = await db.prepare(
    'SELECT * FROM environments WHERE id = ? AND deleted_at IS NULL'
  ).bind(envId).first<EnvRow>()
  if (!env) throw new HttpError(404, { error: 'Environment not found' })

  const project = await db.prepare(
    'SELECT * FROM projects WHERE id = ? AND deleted_at IS NULL'
  ).bind(env.project_id).first<ProjectRow>()
  if (!project) throw new HttpError(404, { error: 'Project not found' })

  const orgId = project.org_id

  const member = await db.prepare(
    'SELECT * FROM org_members WHERE org_id = ? AND user_id = ?'
  ).bind(orgId, userId).first<OrgMemberRow>()

  if (!member) throw new HttpError(403, { error: 'Not a member of this organization' })

  if (member.role === ORG_ROLE_OWNER || member.role === ORG_ROLE_ADMIN) {
    return orgId
  }

  const perm = await db.prepare(
    'SELECT * FROM env_permissions WHERE env_id = ? AND user_id = ?'
  ).bind(envId, userId).first<EnvPermissionRow>()

  if (!perm) throw new HttpError(403, { error: 'No access to this environment' })
  if (!allowedRoles.includes(perm.role)) {
    throw new HttpError(403, { error: 'Insufficient permissions' })
  }

  return orgId
}

export type { UserRow, SessionRow }
