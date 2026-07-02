import { eq, and, isNull } from 'drizzle-orm'
import { db } from './db'
import { projects, environments, orgMembers, envPermissions } from './schema'
import { HttpError } from './auth'

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
      const rows = await db.select({ org_id: projects.org_id }).from(projects)
        .where(and(eq(projects.id, projectId), isNull(projects.deleted_at)))
        .limit(1)
      const project = rows[0]
      if (!project) throw new HttpError(404, { error: 'Project not found' })
      orgId = project.org_id
    } else if (envId) {
      const envRows = await db.select({ project_id: environments.project_id }).from(environments)
        .where(and(eq(environments.id, envId), isNull(environments.deleted_at)))
        .limit(1)
      const env = envRows[0]
      if (!env) throw new HttpError(404, { error: 'Environment not found' })
      const projectRows = await db.select({ org_id: projects.org_id }).from(projects)
        .where(and(eq(projects.id, env.project_id), isNull(projects.deleted_at)))
        .limit(1)
      const project = projectRows[0]
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

  const rows = await db.select().from(orgMembers)
    .where(and(eq(orgMembers.org_id, orgId), eq(orgMembers.user_id, userId)))
    .limit(1)
  const member = rows[0]

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

  const envRows = await db.select().from(environments)
    .where(and(eq(environments.id, envId), isNull(environments.deleted_at)))
    .limit(1)
  const env = envRows[0]
  if (!env) throw new HttpError(404, { error: 'Environment not found' })

  const projectRows = await db.select().from(projects)
    .where(and(eq(projects.id, env.project_id), isNull(projects.deleted_at)))
    .limit(1)
  const project = projectRows[0]
  if (!project) throw new HttpError(404, { error: 'Project not found' })

  const orgId = project.org_id

  const memberRows = await db.select().from(orgMembers)
    .where(and(eq(orgMembers.org_id, orgId), eq(orgMembers.user_id, userId)))
    .limit(1)
  const member = memberRows[0]

  if (!member) throw new HttpError(403, { error: 'Not a member of this organization' })

  if (member.role === ORG_ROLE_OWNER || member.role === ORG_ROLE_ADMIN) {
    return orgId
  }

  const permRows = await db.select().from(envPermissions)
    .where(and(eq(envPermissions.env_id, envId), eq(envPermissions.user_id, userId)))
    .limit(1)
  const perm = permRows[0]

  if (!perm) throw new HttpError(403, { error: 'No access to this environment' })
  if (!allowedRoles.includes(perm.role)) {
    throw new HttpError(403, { error: 'Insufficient permissions' })
  }

  return orgId
}
