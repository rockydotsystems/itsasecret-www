import { createFileRoute } from '@tanstack/react-router'
import { z } from 'zod'
import { eq, and, isNull } from 'drizzle-orm'
import { db } from '~/lib/db'
import { teams, teamEnvPermissions } from '~/lib/schema'
import { auditLog } from '~/lib/db-utils'
import { requireAuth, errorResponse } from '~/lib/auth'
import { requireEnvRole, ROLE_READ, ROLE_WRITE, ROLE_ADMIN } from '~/lib/rbac'
import { getLiveTeam } from '~/lib/teams'

const grantSchema = z.object({
  teamId: z.string(),
  role: z.enum([ROLE_READ, ROLE_WRITE, ROLE_ADMIN]),
})

export const Route = createFileRoute('/api/envs/$envId/team-permissions')({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        try {
          const { user } = await requireAuth(request)
          await requireEnvRole(params, user.id, [ROLE_READ, ROLE_WRITE, ROLE_ADMIN])
          const envId = params.envId!
          const rows = await db.select({
            env_id: teamEnvPermissions.env_id,
            team_id: teamEnvPermissions.team_id,
            team_name: teams.name,
            role: teamEnvPermissions.role,
            created_at: teamEnvPermissions.created_at,
          }).from(teamEnvPermissions)
            .innerJoin(teams, and(eq(teams.id, teamEnvPermissions.team_id), isNull(teams.deleted_at)))
            .where(eq(teamEnvPermissions.env_id, envId))
          return Response.json(rows, { status: 200 })
        } catch (err) {
          return errorResponse(err)
        }
      },

      POST: async ({ request, params }) => {
        try {
          const { user } = await requireAuth(request)
          const orgId = await requireEnvRole(params, user.id, [ROLE_ADMIN])
          const envId = params.envId!
          const { teamId, role } = grantSchema.parse(await request.json())

          const team = await getLiveTeam(orgId, teamId)
          if (!team) return Response.json({ error: 'Team not found in this organization' }, { status: 404 })

          const existingRows = await db.select().from(teamEnvPermissions)
            .where(and(eq(teamEnvPermissions.env_id, envId), eq(teamEnvPermissions.team_id, teamId)))
            .limit(1)
          if (existingRows[0]) return Response.json({ error: 'Permission already exists' }, { status: 409 })

          await db.insert(teamEnvPermissions).values({
            env_id: envId,
            team_id: teamId,
            role,
            granted_by: user.id,
          })
          await auditLog({ orgId, actorUserId: user.id, action: 'env.team_permission.grant', targetType: 'env', targetId: envId, metadata: { teamId, role } })

          return Response.json({ env_id: envId, team_id: teamId, team_name: team.name, role }, { status: 201 })
        } catch (err) {
          return errorResponse(err)
        }
      },
    },
  },
})
