import { createServerFn } from '@tanstack/react-start'
import { getCookie } from '@tanstack/react-start/server'
import { z } from 'zod'
import { eq, and, isNull } from 'drizzle-orm'
import { db } from '~/lib/db'
import { orgs, orgMembers, projects, environments, userLastOrg, userLastProject, userLastEnv } from '~/lib/schema'
import { requireAuth, getCurrentUserFromRequest } from '~/lib/auth'
import { requireOrgRole, ORG_ROLE_OWNER, ORG_ROLE_ADMIN, ORG_ROLE_MEMBER } from '~/lib/rbac'
import type { Org, Project, Environment } from '~/lib/schema'

function buildAuthRequest(): Request | null {
  const token = getCookie('session_token')
  if (!token) return null
  return new Request('http://localhost', {
    headers: { Authorization: `Bearer ${token}` },
  })
}

export const getOrgsFn = createServerFn({ method: 'GET' })
  .handler(async (): Promise<Org[]> => {
    const request = buildAuthRequest()
    if (!request) return []
    const user = await getCurrentUserFromRequest(request)
    if (!user) return []

    return listOrgsForUser(user.id)
  })

export const getProjectsFn = createServerFn({ method: 'GET' })
  .validator(z.object({ orgId: z.string() }))
  .handler(async ({ data }): Promise<Project[]> => {
    const request = buildAuthRequest()
    if (!request) return []
    const { user } = await requireAuth(request)
    const { orgId } = data

    await requireOrgRole({ orgId }, user.id, [ORG_ROLE_OWNER, ORG_ROLE_ADMIN, ORG_ROLE_MEMBER])

    const rows = await db.select().from(projects)
      .where(and(eq(projects.org_id, orgId), isNull(projects.deleted_at)))

    return rows
  })

export type EnvState = {
  environments: Environment[]
  envId: string
}

export type ProjectState = EnvState & {
  projects: Project[]
  projectId: string
}

export type DashboardState = ProjectState & {
  orgs: Org[]
  orgId: string
}

async function listOrgsForUser(userId: string): Promise<Org[]> {
  return db.select({
    id: orgs.id,
    name: orgs.name,
    kind: orgs.kind,
    owner_user_id: orgs.owner_user_id,
    created_at: orgs.created_at,
    deleted_at: orgs.deleted_at,
  }).from(orgs)
    .innerJoin(orgMembers, and(eq(orgMembers.org_id, orgs.id), eq(orgMembers.user_id, userId)))
    .where(isNull(orgs.deleted_at))
}

// Resolves the environment list for a project plus the user's last-visited
// env in it, falling back to the first env when there is no valid record.
async function loadEnvState(userId: string, projectId: string): Promise<EnvState> {
  const envs = await db.select().from(environments)
    .where(and(eq(environments.project_id, projectId), isNull(environments.deleted_at)))

  const lastRows = await db.select({ env_id: userLastEnv.env_id }).from(userLastEnv)
    .where(and(eq(userLastEnv.user_id, userId), eq(userLastEnv.project_id, projectId)))
    .limit(1)
  const lastEnvId = lastRows[0]?.env_id
  const envId = envs.find((e) => e.id === lastEnvId)?.id ?? envs[0]?.id ?? ''

  return { environments: envs, envId }
}

// Same idea one level up: projects of an org plus the user's last-visited
// project, then the env state for whichever project was resolved.
async function loadProjectState(userId: string, orgId: string): Promise<ProjectState> {
  const rows = await db.select().from(projects)
    .where(and(eq(projects.org_id, orgId), isNull(projects.deleted_at)))

  const lastRows = await db.select({ project_id: userLastProject.project_id }).from(userLastProject)
    .where(and(eq(userLastProject.user_id, userId), eq(userLastProject.org_id, orgId)))
    .limit(1)
  const lastProjectId = lastRows[0]?.project_id
  const projectId = rows.find((p) => p.id === lastProjectId)?.id ?? rows[0]?.id ?? ''

  const envState = projectId
    ? await loadEnvState(userId, projectId)
    : { environments: [], envId: '' }

  return { projects: rows, projectId, ...envState }
}

export const getDashboardStateFn = createServerFn({ method: 'GET' })
  .handler(async (): Promise<DashboardState> => {
    const empty: DashboardState = { orgs: [], orgId: '', projects: [], projectId: '', environments: [], envId: '' }
    const request = buildAuthRequest()
    if (!request) return empty
    const user = await getCurrentUserFromRequest(request)
    if (!user) return empty

    const userOrgs = await listOrgsForUser(user.id)

    const lastRows = await db.select({ org_id: userLastOrg.org_id }).from(userLastOrg)
      .where(eq(userLastOrg.user_id, user.id))
      .limit(1)
    const lastOrgId = lastRows[0]?.org_id
    const orgId = userOrgs.find((o) => o.id === lastOrgId)?.id ?? userOrgs[0]?.id ?? ''

    const projectState = orgId
      ? await loadProjectState(user.id, orgId)
      : { projects: [], projectId: '', environments: [] as Environment[], envId: '' }

    return { orgs: userOrgs, orgId, ...projectState }
  })

export const visitOrgFn = createServerFn({ method: 'POST' })
  .validator(z.object({ orgId: z.string() }))
  .handler(async ({ data }): Promise<ProjectState> => {
    const request = buildAuthRequest()
    if (!request) throw new Error('Not authenticated')
    const { user } = await requireAuth(request)
    const { orgId } = data

    await requireOrgRole({ orgId }, user.id, [ORG_ROLE_OWNER, ORG_ROLE_ADMIN, ORG_ROLE_MEMBER])

    await db.insert(userLastOrg)
      .values({ user_id: user.id, org_id: orgId })
      .onConflictDoUpdate({
        target: userLastOrg.user_id,
        set: { org_id: orgId, updated_at: new Date() },
      })

    return loadProjectState(user.id, orgId)
  })

export const visitProjectFn = createServerFn({ method: 'POST' })
  .validator(z.object({ projectId: z.string() }))
  .handler(async ({ data }): Promise<EnvState> => {
    const request = buildAuthRequest()
    if (!request) throw new Error('Not authenticated')
    const { user } = await requireAuth(request)
    const { projectId } = data

    const orgId = await requireOrgRole({ projectId }, user.id, [ORG_ROLE_OWNER, ORG_ROLE_ADMIN, ORG_ROLE_MEMBER])

    await db.insert(userLastProject)
      .values({ user_id: user.id, org_id: orgId, project_id: projectId })
      .onConflictDoUpdate({
        target: [userLastProject.user_id, userLastProject.org_id],
        set: { project_id: projectId, updated_at: new Date() },
      })

    return loadEnvState(user.id, projectId)
  })

export const visitEnvFn = createServerFn({ method: 'POST' })
  .validator(z.object({ envId: z.string() }))
  .handler(async ({ data }): Promise<void> => {
    const request = buildAuthRequest()
    if (!request) throw new Error('Not authenticated')
    const { user } = await requireAuth(request)
    const { envId } = data

    await requireOrgRole({ envId }, user.id, [ORG_ROLE_OWNER, ORG_ROLE_ADMIN, ORG_ROLE_MEMBER])

    const envRows = await db.select({ project_id: environments.project_id }).from(environments)
      .where(and(eq(environments.id, envId), isNull(environments.deleted_at)))
      .limit(1)
    const env = envRows[0]
    if (!env) throw new Error('Environment not found')

    await db.insert(userLastEnv)
      .values({ user_id: user.id, project_id: env.project_id, env_id: envId })
      .onConflictDoUpdate({
        target: [userLastEnv.user_id, userLastEnv.project_id],
        set: { env_id: envId, updated_at: new Date() },
      })
  })
