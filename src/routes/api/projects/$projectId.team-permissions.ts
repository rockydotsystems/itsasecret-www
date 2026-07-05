import { createFileRoute } from '@tanstack/react-router'
import { z } from 'zod'
import { eq, and, isNull } from 'drizzle-orm'
import { db } from '~/lib/db'
import { teams, teamProjectPermissions } from '~/lib/schema'
import { auditLog } from '~/lib/db-utils'
import { requireAuth, errorResponse } from '~/lib/auth'
import { requireOrgRole, ORG_ROLE_OWNER, ORG_ROLE_ADMIN, ORG_ROLE_MEMBER, ROLE_READ, ROLE_WRITE, ROLE_ADMIN } from '~/lib/rbac'
import { getLiveTeam } from '~/lib/teams'

const grantSchema = z.object({
  teamId: z.string(),
  role: z.enum([ROLE_READ, ROLE_WRITE, ROLE_ADMIN]),
})

// Project-level grants cover every env in the project, present and future
// (forks included), so managing them is org owner/admin only - a single
// env's admin must not be able to widen access project-wide.
export const Route = createFileRoute('/api/projects/$projectId/team-permissions')({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        try {
          const { user } = await requireAuth(request)
          await requireOrgRole(params, user.id, [ORG_ROLE_OWNER, ORG_ROLE_ADMIN, ORG_ROLE_MEMBER])
          const projectId = params.projectId!
          const rows = await db.select({
            project_id: teamProjectPermissions.project_id,
            team_id: teamProjectPermissions.team_id,
            team_name: teams.name,
            role: teamProjectPermissions.role,
            created_at: teamProjectPermissions.created_at,
          }).from(teamProjectPermissions)
            .innerJoin(teams, and(eq(teams.id, teamProjectPermissions.team_id), isNull(teams.deleted_at)))
            .where(eq(teamProjectPermissions.project_id, projectId))
          return Response.json(rows, { status: 200 })
        } catch (err) {
          return errorResponse(err)
        }
      },

      POST: async ({ request, params }) => {
        try {
          const { user } = await requireAuth(request)
          const orgId = await requireOrgRole(params, user.id, [ORG_ROLE_OWNER, ORG_ROLE_ADMIN])
          const projectId = params.projectId!
          const { teamId, role } = grantSchema.parse(await request.json())

          const team = await getLiveTeam(orgId, teamId)
          if (!team) return Response.json({ error: 'Team not found in this organization' }, { status: 404 })

          const existingRows = await db.select().from(teamProjectPermissions)
            .where(and(eq(teamProjectPermissions.project_id, projectId), eq(teamProjectPermissions.team_id, teamId)))
            .limit(1)
          if (existingRows[0]) return Response.json({ error: 'Permission already exists' }, { status: 409 })

          await db.insert(teamProjectPermissions).values({
            project_id: projectId,
            team_id: teamId,
            role,
            granted_by: user.id,
          })
          await auditLog({ orgId, actorUserId: user.id, action: 'project.team_permission.grant', targetType: 'project', targetId: projectId, metadata: { teamId, role } })

          return Response.json({ project_id: projectId, team_id: teamId, team_name: team.name, role }, { status: 201 })
        } catch (err) {
          return errorResponse(err)
        }
      },
    },
  },
})
