import { createFileRoute } from '@tanstack/react-router'
import { z } from 'zod'
import { eq, and } from 'drizzle-orm'
import { db } from '~/lib/db'
import { orgMembers, teamMembers, users } from '~/lib/schema'
import { auditLog } from '~/lib/db-utils'
import { requireAuth, errorResponse } from '~/lib/auth'
import { requireOrgRole, ORG_ROLE_OWNER, ORG_ROLE_ADMIN } from '~/lib/rbac'
import { getLiveTeam } from '~/lib/teams'

const addSchema = z.object({
  userId: z.string(),
})

export const Route = createFileRoute('/api/orgs/$orgId/teams/$teamId/members')({
  server: {
    handlers: {
      POST: async ({ request, params }) => {
        try {
          const { user } = await requireAuth(request)
          await requireOrgRole(params, user.id, [ORG_ROLE_OWNER, ORG_ROLE_ADMIN])
          const orgId = params.orgId!
          const teamId = params.teamId!
          const { userId } = addSchema.parse(await request.json())

          const team = await getLiveTeam(orgId, teamId)
          if (!team) return Response.json({ error: 'Team not found' }, { status: 404 })

          // Org membership is the gate; teams only group people already in.
          const memberRows = await db.select().from(orgMembers)
            .where(and(eq(orgMembers.org_id, orgId), eq(orgMembers.user_id, userId)))
            .limit(1)
          if (!memberRows[0]) return Response.json({ error: 'User is not a member of this organization' }, { status: 404 })

          const existingRows = await db.select().from(teamMembers)
            .where(and(eq(teamMembers.team_id, teamId), eq(teamMembers.user_id, userId)))
            .limit(1)
          if (existingRows[0]) return Response.json({ error: 'User is already in this team' }, { status: 409 })

          await db.insert(teamMembers).values({
            team_id: teamId,
            user_id: userId,
            added_by: user.id,
          })
          await auditLog({ orgId, actorUserId: user.id, action: 'team.member.add', targetType: 'team', targetId: teamId, metadata: { userId } })

          const emailRows = await db.select({ email: users.email }).from(users)
            .where(eq(users.id, userId))
            .limit(1)
          return Response.json({ team_id: teamId, user_id: userId, email: emailRows[0]?.email ?? '' }, { status: 201 })
        } catch (err) {
          return errorResponse(err)
        }
      },
    },
  },
})
