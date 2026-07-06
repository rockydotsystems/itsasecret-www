import { createFileRoute } from '@tanstack/react-router'
import { eq, and, isNull } from 'drizzle-orm'
import { db } from '~/lib/db'
import { orgs, teamMembers, users } from '~/lib/schema'
import { auditLog } from '~/lib/db-utils'
import { requireAuth, errorResponse } from '~/lib/auth'
import { requireOrgRole, ORG_ROLE_OWNER, ORG_ROLE_ADMIN } from '~/lib/rbac'
import { getLiveTeam } from '~/lib/teams'
import { sendTeamRemovedEmail } from '~/lib/email'

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

          const removed = await db.delete(teamMembers)
            .where(and(eq(teamMembers.team_id, teamId), eq(teamMembers.user_id, targetUserId)))
            .returning({ user_id: teamMembers.user_id })
          await auditLog({ orgId, actorUserId: user.id, action: 'team.member.remove', targetType: 'team', targetId: teamId, metadata: { userId: targetUserId } })

          // Heads-up notification, only when a membership actually existed.
          // Best-effort: a delivery hiccup must not fail the removal.
          if (removed.length > 0) {
            const [emailRows, orgRows] = await Promise.all([
              db.select({ email: users.email }).from(users)
                .where(eq(users.id, targetUserId))
                .limit(1),
              db.select({ name: orgs.name }).from(orgs)
                .where(and(eq(orgs.id, orgId), isNull(orgs.deleted_at)))
                .limit(1),
            ])
            if (emailRows[0] && orgRows[0]) {
              await sendTeamRemovedEmail({
                to: emailRows[0].email,
                teamName: team.name,
                orgName: orgRows[0].name,
                removedByEmail: user.email,
              })
            }
          }

          return new Response(null, { status: 204 })
        } catch (err) {
          return errorResponse(err)
        }
      },
    },
  },
})
