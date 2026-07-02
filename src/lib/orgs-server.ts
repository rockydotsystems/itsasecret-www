import { createServerFn } from '@tanstack/react-start'
import { getCookie } from '@tanstack/react-start/server'
import { z } from 'zod'
import { eq, and, isNull } from 'drizzle-orm'
import { db } from '~/lib/db'
import { orgs, orgMembers, projects } from '~/lib/schema'
import { requireAuth, getCurrentUserFromRequest } from '~/lib/auth'
import { requireOrgRole, ORG_ROLE_OWNER, ORG_ROLE_ADMIN, ORG_ROLE_MEMBER } from '~/lib/rbac'
import type { Org, Project } from '~/lib/schema'

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

    const rows = await db.select({
      id: orgs.id,
      name: orgs.name,
      kind: orgs.kind,
      owner_user_id: orgs.owner_user_id,
      created_at: orgs.created_at,
      deleted_at: orgs.deleted_at,
    }).from(orgs)
      .innerJoin(orgMembers, and(eq(orgMembers.org_id, orgs.id), eq(orgMembers.user_id, user.id)))
      .where(isNull(orgs.deleted_at))

    return rows
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
