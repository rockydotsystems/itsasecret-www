import { createFileRoute } from '@tanstack/react-router'
import { z } from 'zod'
import { eq, and } from 'drizzle-orm'
import { db } from '~/lib/db'
import { teamEnvPermissions } from '~/lib/schema'
import { auditLog } from '~/lib/db-utils'
import { requireAuth, errorResponse } from '~/lib/auth'
import { requireEnvRole, ROLE_READ, ROLE_WRITE, ROLE_ADMIN } from '~/lib/rbac'
import { getLiveTeam } from '~/lib/teams'

const updateSchema = z.object({
  role: z.enum([ROLE_READ, ROLE_WRITE, ROLE_ADMIN]),
})

export const Route = createFileRoute('/api/envs/$envId/team-permissions/$teamId')({
  server: {
    handlers: {
      PATCH: async ({ request, params }) => {
        try {
          const { user } = await requireAuth(request)
          const orgId = await requireEnvRole(params, user.id, [ROLE_ADMIN])
          const envId = params.envId!
          const teamId = params.teamId!
          const { role } = updateSchema.parse(await request.json())

          const team = await getLiveTeam(orgId, teamId)
          if (!team) return Response.json({ error: 'Team not found in this organization' }, { status: 404 })

          const permRows = await db.select().from(teamEnvPermissions)
            .where(and(eq(teamEnvPermissions.env_id, envId), eq(teamEnvPermissions.team_id, teamId)))
            .limit(1)
          if (!permRows[0]) return Response.json({ error: 'Permission not found' }, { status: 404 })

          await db.update(teamEnvPermissions).set({ role })
            .where(and(eq(teamEnvPermissions.env_id, envId), eq(teamEnvPermissions.team_id, teamId)))
          await auditLog({ orgId, actorUserId: user.id, action: 'env.team_permission.update', targetType: 'env', targetId: envId, metadata: { teamId, role } })

          return Response.json({ env_id: envId, team_id: teamId, role }, { status: 200 })
        } catch (err) {
          return errorResponse(err)
        }
      },

      DELETE: async ({ request, params }) => {
        try {
          const { user } = await requireAuth(request)
          const orgId = await requireEnvRole(params, user.id, [ROLE_ADMIN])
          const envId = params.envId!
          const teamId = params.teamId!

          const team = await getLiveTeam(orgId, teamId)
          if (!team) return Response.json({ error: 'Team not found in this organization' }, { status: 404 })

          await db.delete(teamEnvPermissions)
            .where(and(eq(teamEnvPermissions.env_id, envId), eq(teamEnvPermissions.team_id, teamId)))
          await auditLog({ orgId, actorUserId: user.id, action: 'env.team_permission.revoke', targetType: 'env', targetId: envId, metadata: { teamId } })
          return new Response(null, { status: 204 })
        } catch (err) {
          return errorResponse(err)
        }
      },
    },
  },
})
