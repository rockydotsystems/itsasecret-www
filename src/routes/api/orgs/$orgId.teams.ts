import { createFileRoute } from '@tanstack/react-router'
import { z } from 'zod'
import { eq, and, isNull } from 'drizzle-orm'
import { db } from '~/lib/db'
import { orgs, teams } from '~/lib/schema'
import { generateId, auditLog } from '~/lib/db-utils'
import { requireAuth, errorResponse } from '~/lib/auth'
import { requireOrgRole, ORG_ROLE_OWNER, ORG_ROLE_ADMIN, ORG_ROLE_MEMBER } from '~/lib/rbac'
import { listOrgTeams } from '~/lib/teams'

const createSchema = z.object({
  name: z.string().trim().min(1).max(80),
})

export const Route = createFileRoute('/api/orgs/$orgId/teams')({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        try {
          const { user } = await requireAuth(request)
          await requireOrgRole(params, user.id, [ORG_ROLE_OWNER, ORG_ROLE_ADMIN, ORG_ROLE_MEMBER])
          return Response.json(await listOrgTeams(params.orgId!), { status: 200 })
        } catch (err) {
          return errorResponse(err)
        }
      },

      POST: async ({ request, params }) => {
        try {
          const { user } = await requireAuth(request)
          await requireOrgRole(params, user.id, [ORG_ROLE_OWNER, ORG_ROLE_ADMIN])
          const orgId = params.orgId!
          const { name } = createSchema.parse(await request.json())

          const orgRows = await db.select().from(orgs)
            .where(and(eq(orgs.id, orgId), isNull(orgs.deleted_at)))
            .limit(1)
          const org = orgRows[0] ?? null
          if (!org) return Response.json({ error: 'Org not found' }, { status: 404 })
          if (org.kind === 'personal') {
            return Response.json({ error: 'Personal organizations cannot have teams' }, { status: 403 })
          }

          const dupRows = await db.select({ id: teams.id }).from(teams)
            .where(and(eq(teams.org_id, orgId), eq(teams.name, name), isNull(teams.deleted_at)))
            .limit(1)
          if (dupRows[0]) return Response.json({ error: 'A team with that name already exists' }, { status: 409 })

          const teamId = generateId()
          await db.insert(teams).values({
            id: teamId,
            org_id: orgId,
            name,
            created_by: user.id,
          })
          await auditLog({ orgId, actorUserId: user.id, action: 'team.create', targetType: 'team', targetId: teamId, metadata: { name } })

          return Response.json({ id: teamId, name, members: [] }, { status: 201 })
        } catch (err) {
          return errorResponse(err)
        }
      },
    },
  },
})
