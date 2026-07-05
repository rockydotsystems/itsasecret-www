import { createFileRoute } from '@tanstack/react-router'
import { eq, and } from 'drizzle-orm'
import { db } from '~/lib/db'
import { teamMembers } from '~/lib/schema'
import { auditLog } from '~/lib/db-utils'
import { requireAuth, errorResponse } from '~/lib/auth'
import { requireOrgRole, ORG_ROLE_OWNER, ORG_ROLE_ADMIN } from '~/lib/rbac'
import { getLiveTeam } from '~/lib/teams'

export const Route = createFileRoute('/api/orgs/$orgId/teams/$teamId/members/$userId')({
  server: {
    handlers: {
      DELETE: async ({ request, params }) => {
        try {
          const { user } = await requireAuth(request)
          await requireOrgRole(params, user.id, [ORG_ROLE_OWNER, ORG_ROLE_ADMIN])
          const orgId = params.orgId!
          const teamId = params.teamId!
          const targetUserId = params.userId!

          const team = await getLiveTeam(orgId, teamId)
          if (!team) return Response.json({ error: 'Team not found' }, { status: 404 })

          await db.delete(teamMembers)
            .where(and(eq(teamMembers.team_id, teamId), eq(teamMembers.user_id, targetUserId)))
          await auditLog({ orgId, actorUserId: user.id, action: 'team.member.remove', targetType: 'team', targetId: teamId, metadata: { userId: targetUserId } })

          return new Response(null, { status: 204 })
        } catch (err) {
          return errorResponse(err)
        }
      },
    },
  },
})
