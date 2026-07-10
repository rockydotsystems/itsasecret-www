import { createFileRoute } from '@tanstack/react-router'
import { z } from 'zod'
import { eq, and, isNull } from 'drizzle-orm'
import { db } from '~/lib/db'
import { orgs, orgMembers, teamMembers, users } from '~/lib/schema'
import { auditLog } from '~/lib/db-utils'
import { requireAuth, errorResponse } from '~/lib/auth'
import { requireOrgRole, ORG_ROLE_OWNER, ORG_ROLE_ADMIN } from '~/lib/rbac'
import { getLiveTeam } from '~/lib/teams'
import { sendTeamAddedEmail } from '~/lib/email'
import { isRateLimited, recordFailedAttempt } from '~/lib/rate-limit'

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

          // Rate limit per actor: each add sends a notification email, so a
          // malicious admin could otherwise spam members. Count every attempt
          // (the email is best-effort, but the cost is real).
          const limit = isRateLimited(`team-add:${user.id}`)
          if (limit.limited) {
            return Response.json(
              { error: 'Too many team changes. Please try again later.' },
              { status: 429, headers: { 'Retry-After': String(limit.retryAfterSeconds) } }
            )
          }
          recordFailedAttempt(`team-add:${user.id}`)

          await db.insert(teamMembers).values({
            team_id: teamId,
            user_id: userId,
            added_by: user.id,
          })
          await auditLog({ orgId, actorUserId: user.id, action: 'team.member.add', targetType: 'team', targetId: teamId, metadata: { userId } })

          const [emailRows, orgRows] = await Promise.all([
            db.select({ email: users.email }).from(users)
              .where(eq(users.id, userId))
              .limit(1),
            db.select({ name: orgs.name }).from(orgs)
              .where(and(eq(orgs.id, orgId), isNull(orgs.deleted_at)))
              .limit(1),
          ])
          const email = emailRows[0]?.email ?? ''

          // Heads-up notification only - nothing to accept, and a delivery
          // hiccup must not fail the add (the team_members row is in).
          if (email && orgRows[0]) {
            const baseUrl = process.env.APP_URL ?? new URL(request.url).origin
            await sendTeamAddedEmail({
              to: email,
              teamName: team.name,
              orgName: orgRows[0].name,
              addedByEmail: user.email,
              dashboardUrl: `${baseUrl}/dashboard/${orgId}/settings`,
            })
          }

          return Response.json({ team_id: teamId, user_id: userId, email }, { status: 201 })
        } catch (err) {
          return errorResponse(err)
        }
      },
    },
  },
})
