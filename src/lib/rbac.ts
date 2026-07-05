import { eq, and, isNull } from 'drizzle-orm'
import { db } from './db'
import { projects, environments, orgMembers, envPermissions, teams, teamMembers, teamEnvPermissions, teamProjectPermissions } from './schema'
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

const ROLE_RANK: Record<string, number> = {
  [ROLE_READ]: 1,
  [ROLE_WRITE]: 2,
  [ROLE_ADMIN]: 3,
}

// Additive max-wins: grants only ever widen access, there are no deny rules.
// Unknown role strings rank as nothing. '' = no access.
export function maxRole(roles: Array<string | null | undefined>): string {
  let best = ''
  let bestRank = 0
  for (const role of roles) {
    const rank = role ? (ROLE_RANK[role] ?? 0) : 0
    if (rank > bestRank) {
      best = role!
      bestRank = rank
    }
  }
  return best
}

// Effective env role a plain org member gets from explicit grants: the max of
// their direct env grant, their teams' env grants, and their teams' project
// grants. Grants through soft-deleted teams die instantly, not at purge time.
// Callers must have verified org membership first (that stays the outer gate,
// so a stale team_members row on its own grants nothing) and handle the
// owner/admin bypass themselves. This is THE resolver - enforcement
// (requireEnvRole) and dashboard display (orgs-server) both go through it;
// do not reimplement it elsewhere.
export async function memberEnvRole(userId: string, envId: string, projectId: string): Promise<string> {
  const [direct, teamEnv, teamProject] = await Promise.all([
    db.select({ role: envPermissions.role }).from(envPermissions)
      .where(and(eq(envPermissions.env_id, envId), eq(envPermissions.user_id, userId))),
    db.select({ role: teamEnvPermissions.role }).from(teamEnvPermissions)
      .innerJoin(teams, and(eq(teams.id, teamEnvPermissions.team_id), isNull(teams.deleted_at)))
      .innerJoin(teamMembers, and(eq(teamMembers.team_id, teamEnvPermissions.team_id), eq(teamMembers.user_id, userId)))
      .where(eq(teamEnvPermissions.env_id, envId)),
    db.select({ role: teamProjectPermissions.role }).from(teamProjectPermissions)
      .innerJoin(teams, and(eq(teams.id, teamProjectPermissions.team_id), isNull(teams.deleted_at)))
      .innerJoin(teamMembers, and(eq(teamMembers.team_id, teamProjectPermissions.team_id), eq(teamMembers.user_id, userId)))
      .where(eq(teamProjectPermissions.project_id, projectId)),
  ])
  return maxRole([...direct, ...teamEnv, ...teamProject].map((r) => r.role))
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

  const role = await memberEnvRole(userId, envId, env.project_id)

  if (!role) throw new HttpError(403, { error: 'No access to this environment' })
  if (!allowedRoles.includes(role)) {
    throw new HttpError(403, { error: 'Insufficient permissions' })
  }

  return orgId
}
