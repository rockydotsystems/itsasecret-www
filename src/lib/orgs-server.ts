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

export type LastVisited = {
  orgId: string
  projectId: string
  envId: string
}

export type OrgView = {
  orgs: Org[]
  projects: Project[]
  projectId: string
}

export type ProjectView = {
  orgs: Org[]
  projects: Project[]
  environments: Environment[]
  envId: string
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

async function listProjectsForOrg(orgId: string): Promise<Project[]> {
  return db.select().from(projects)
    .where(and(eq(projects.org_id, orgId), isNull(projects.deleted_at)))
}

async function lastProjectIdForOrg(userId: string, orgId: string): Promise<string | undefined> {
  const rows = await db.select({ project_id: userLastProject.project_id }).from(userLastProject)
    .where(and(eq(userLastProject.user_id, userId), eq(userLastProject.org_id, orgId)))
    .limit(1)
  return rows[0]?.project_id
}

async function lastEnvIdForProject(userId: string, projectId: string): Promise<string | undefined> {
  const rows = await db.select({ env_id: userLastEnv.env_id }).from(userLastEnv)
    .where(and(eq(userLastEnv.user_id, userId), eq(userLastEnv.project_id, projectId)))
    .limit(1)
  return rows[0]?.env_id
}

async function recordOrgVisit(userId: string, orgId: string): Promise<void> {
  await db.insert(userLastOrg)
    .values({ user_id: userId, org_id: orgId })
    .onConflictDoUpdate({
      target: userLastOrg.user_id,
      set: { org_id: orgId, updated_at: new Date() },
    })
}

async function recordProjectVisit(userId: string, orgId: string, projectId: string): Promise<void> {
  await db.insert(userLastProject)
    .values({ user_id: userId, org_id: orgId, project_id: projectId })
    .onConflictDoUpdate({
      target: [userLastProject.user_id, userLastProject.org_id],
      set: { project_id: projectId, updated_at: new Date() },
    })
}

async function recordEnvVisit(userId: string, projectId: string, envId: string): Promise<void> {
  await db.insert(userLastEnv)
    .values({ user_id: userId, project_id: projectId, env_id: envId })
    .onConflictDoUpdate({
      target: [userLastEnv.user_id, userLastEnv.project_id],
      set: { env_id: envId, updated_at: new Date() },
    })
}

// Resolves the deepest last-visited location the user still has access to,
// falling back to first org/project/env. Empty strings mean "none".
export const resolveLastVisitedFn = createServerFn({ method: 'GET' })
  .handler(async (): Promise<LastVisited> => {
    const empty: LastVisited = { orgId: '', projectId: '', envId: '' }
    const request = buildAuthRequest()
    if (!request) return empty
    const user = await getCurrentUserFromRequest(request)
    if (!user) return empty

    const userOrgs = await listOrgsForUser(user.id)
    const lastOrgRows = await db.select({ org_id: userLastOrg.org_id }).from(userLastOrg)
      .where(eq(userLastOrg.user_id, user.id))
      .limit(1)
    const orgId = userOrgs.find((o) => o.id === lastOrgRows[0]?.org_id)?.id ?? userOrgs[0]?.id ?? ''
    if (!orgId) return empty

    const orgProjects = await listProjectsForOrg(orgId)
    const lastProjectId = await lastProjectIdForOrg(user.id, orgId)
    const projectId = orgProjects.find((p) => p.id === lastProjectId)?.id ?? orgProjects[0]?.id ?? ''
    if (!projectId) return { orgId, projectId: '', envId: '' }

    const envs = await db.select({ id: environments.id }).from(environments)
      .where(and(eq(environments.project_id, projectId), isNull(environments.deleted_at)))
    const lastEnvId = await lastEnvIdForProject(user.id, projectId)
    const envId = envs.find((e) => e.id === lastEnvId)?.id ?? envs[0]?.id ?? ''

    return { orgId, projectId, envId }
  })

// Loads the org-level dashboard view and records the visit. projectId is the
// user's last-visited (or first) project in the org, for redirecting deeper.
export const getOrgViewFn = createServerFn({ method: 'POST' })
  .validator(z.object({ orgId: z.string() }))
  .handler(async ({ data }): Promise<OrgView> => {
    const request = buildAuthRequest()
    if (!request) throw new Error('Not authenticated')
    const { user } = await requireAuth(request)
    const { orgId } = data

    await requireOrgRole({ orgId }, user.id, [ORG_ROLE_OWNER, ORG_ROLE_ADMIN, ORG_ROLE_MEMBER])
    await recordOrgVisit(user.id, orgId)

    const [userOrgs, orgProjects, lastProjectId] = await Promise.all([
      listOrgsForUser(user.id),
      listProjectsForOrg(orgId),
      lastProjectIdForOrg(user.id, orgId),
    ])
    const projectId = orgProjects.find((p) => p.id === lastProjectId)?.id ?? orgProjects[0]?.id ?? ''

    return { orgs: userOrgs, projects: orgProjects, projectId }
  })

// Loads the project-level dashboard view and records org + project (and, when
// a valid envId is passed, env) visits. The returned envId is the requested
// one when valid, otherwise last-visited or first — callers canonicalize the
// URL against it.
export const getProjectViewFn = createServerFn({ method: 'POST' })
  .validator(z.object({ orgId: z.string(), projectId: z.string(), envId: z.string().optional() }))
  .handler(async ({ data }): Promise<ProjectView> => {
    const request = buildAuthRequest()
    if (!request) throw new Error('Not authenticated')
    const { user } = await requireAuth(request)
    const { orgId, projectId } = data

    await requireOrgRole({ orgId }, user.id, [ORG_ROLE_OWNER, ORG_ROLE_ADMIN, ORG_ROLE_MEMBER])

    const [userOrgs, orgProjects] = await Promise.all([
      listOrgsForUser(user.id),
      listProjectsForOrg(orgId),
    ])
    if (!orgProjects.some((p) => p.id === projectId)) {
      throw new Error('Project not found in organization')
    }

    await recordOrgVisit(user.id, orgId)
    await recordProjectVisit(user.id, orgId, projectId)

    const envs = await db.select().from(environments)
      .where(and(eq(environments.project_id, projectId), isNull(environments.deleted_at)))

    let envId = envs.find((e) => e.id === data.envId)?.id ?? ''
    if (envId) {
      await recordEnvVisit(user.id, projectId, envId)
    } else {
      const lastEnvId = await lastEnvIdForProject(user.id, projectId)
      envId = envs.find((e) => e.id === lastEnvId)?.id ?? envs[0]?.id ?? ''
    }

    return { orgs: userOrgs, projects: orgProjects, environments: envs, envId }
  })
