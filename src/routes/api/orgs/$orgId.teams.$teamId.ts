import { createFileRoute } from '@tanstack/react-router'
import { z } from 'zod'
import { eq, and, isNull } from 'drizzle-orm'
import { db } from '~/lib/db'
import { teams } from '~/lib/schema'
import { auditLog } from '~/lib/db-utils'
import { requireAuth, errorResponse } from '~/lib/auth'
import { requireOrgRole, ORG_ROLE_OWNER, ORG_ROLE_ADMIN } from '~/lib/rbac'
import { getLiveTeam } from '~/lib/teams'

const updateSchema = z.object({
  name: z.string().trim().min(1).max(80),
})

export const Route = createFileRoute('/api/orgs/$orgId/teams/$teamId')({
  server: {
    handlers: {
      PATCH: async ({ request, params }) => {
        try {
          const { user } = await requireAuth(request)
          await requireOrgRole(params, user.id, [ORG_ROLE_OWNER, ORG_ROLE_ADMIN])
          const orgId = params.orgId!
          const teamId = params.teamId!
          const { name } = updateSchema.parse(await request.json())

          const team = await getLiveTeam(orgId, teamId)
          if (!team) return Response.json({ error: 'Team not found' }, { status: 404 })

          const dupRows = await db.select({ id: teams.id }).from(teams)
            .where(and(eq(teams.org_id, orgId), eq(teams.name, name), isNull(teams.deleted_at)))
            .limit(1)
          if (dupRows[0] && dupRows[0].id !== teamId) {
            return Response.json({ error: 'A team with that name already exists' }, { status: 409 })
          }

          await db.update(teams).set({ name }).where(eq(teams.id, teamId))
          await auditLog({ orgId, actorUserId: user.id, action: 'team.rename', targetType: 'team', targetId: teamId, metadata: { name } })

          return Response.json({ id: teamId, name }, { status: 200 })
        } catch (err) {
          return errorResponse(err)
        }
      },

      DELETE: async ({ request, params }) => {
        try {
          const { user } = await requireAuth(request)
          await requireOrgRole(params, user.id, [ORG_ROLE_OWNER, ORG_ROLE_ADMIN])
          const orgId = params.orgId!
          const teamId = params.teamId!

          const team = await getLiveTeam(orgId, teamId)
          if (!team) return Response.json({ error: 'Team not found' }, { status: 404 })

          // Soft delete. Grants and membership rows stay, but the resolver
          // filters deleted teams, so all access through this team ends now.
          await db.update(teams).set({ deleted_at: new Date() }).where(eq(teams.id, teamId))
          await auditLog({ orgId, actorUserId: user.id, action: 'team.delete', targetType: 'team', targetId: teamId, metadata: { name: team.name } })

          return new Response(null, { status: 204 })
        } catch (err) {
          return errorResponse(err)
        }
      },
    },
  },
})
