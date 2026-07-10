import { createFileRoute } from '@tanstack/react-router'
import { z } from 'zod'
import { eq, and, isNull, inArray } from 'drizzle-orm'
import { db } from '~/lib/db'
import { orgs, orgMembers, teams, teamMembers, environments, projects, envPermissions } from '~/lib/schema'
import { auditLog } from '~/lib/db-utils'
import { requireAuth, errorResponse } from '~/lib/auth'
import { revokeAllUserSessions } from '~/lib/sessions'
import { requireOrgRole, ORG_ROLE_OWNER, ORG_ROLE_ADMIN, ORG_ROLE_MEMBER } from '~/lib/rbac'

const updateSchema = z.object({
  role: z.enum([ORG_ROLE_ADMIN, ORG_ROLE_MEMBER]),
})

export const Route = createFileRoute('/api/orgs/$orgId/members/$userId')({
  server: {
    handlers: {
      PATCH: async ({ request, params }) => {
        try {
          const { user } = await requireAuth(request)
          await requireOrgRole(params, user.id, [ORG_ROLE_OWNER, ORG_ROLE_ADMIN])
          const orgId = params.orgId!
          const targetUserId = params.userId!
          const body = updateSchema.parse(await request.json())

          const orgRows = await db.select().from(orgs)
            .where(and(eq(orgs.id, orgId), isNull(orgs.deleted_at)))
            .limit(1)
          const org = orgRows[0] ?? null
          if (!org) return Response.json({ error: 'Org not found' }, { status: 404 })
          if (org.owner_user_id === targetUserId) return Response.json({ error: "Cannot change the org owner's role" }, { status: 403 })

          const memberRows = await db.select().from(orgMembers)
            .where(and(eq(orgMembers.org_id, orgId), eq(orgMembers.user_id, targetUserId)))
            .limit(1)
          if (!memberRows[0]) return Response.json({ error: 'Member not found' }, { status: 404 })

          await db.update(orgMembers).set({ role: body.role })
            .where(and(eq(orgMembers.org_id, orgId), eq(orgMembers.user_id, targetUserId)))
          await auditLog({ orgId, actorUserId: user.id, action: 'member.role', targetType: 'user', targetId: targetUserId, metadata: { role: body.role } })

          return Response.json({ org_id: orgId, user_id: targetUserId, role: body.role }, { status: 200 })
        } catch (err) {
          return errorResponse(err)
        }
      },

      DELETE: async ({ request, params }) => {
        try {
          const { user } = await requireAuth(request)
          await requireOrgRole(params, user.id, [ORG_ROLE_OWNER, ORG_ROLE_ADMIN])
          const orgId = params.orgId!
          const targetUserId = params.userId!

          const orgRows = await db.select().from(orgs)
            .where(and(eq(orgs.id, orgId), isNull(orgs.deleted_at)))
            .limit(1)
          const org = orgRows[0] ?? null
          if (!org) return Response.json({ error: 'Org not found' }, { status: 404 })
          if (org.owner_user_id === targetUserId) return Response.json({ error: 'Cannot remove the org owner' }, { status: 403 })

          await db.delete(orgMembers)
            .where(and(eq(orgMembers.org_id, orgId), eq(orgMembers.user_id, targetUserId)))
          // No CASCADE by convention: drop their team memberships in this org
          // (soft-deleted teams included) so a later re-invite doesn't
          // silently resurrect old team access.
          await db.delete(teamMembers)
            .where(and(
              eq(teamMembers.user_id, targetUserId),
              inArray(teamMembers.team_id, db.select({ id: teams.id }).from(teams).where(eq(teams.org_id, orgId))),
            ))
          // Drop their direct env_permissions for environments in this org too,
          // so re-inviting them doesn't silently resurrect old per-env RBAC
          // grants. Matches the team-membership cleanup above.
          await db.delete(envPermissions)
            .where(and(
              eq(envPermissions.user_id, targetUserId),
              inArray(envPermissions.env_id,
                db.select({ id: environments.id }).from(environments)
                  .innerJoin(projects, eq(projects.id, environments.project_id))
                  .where(eq(projects.org_id, orgId))),
            ))
          // Kicked users' sessions still carry this org's key; revoke them so
          // access ends now (their next login re-establishes other orgs).
          await revokeAllUserSessions(targetUserId)
          await auditLog({ orgId, actorUserId: user.id, action: 'member.remove', targetType: 'user', targetId: targetUserId })
          return new Response(null, { status: 204 })
        } catch (err) {
          return errorResponse(err)
        }
      },
    },
  },
})
