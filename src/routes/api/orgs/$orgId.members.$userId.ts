import { createFileRoute } from '@tanstack/react-router'
import { z } from 'zod'
import { eq, and, isNull, inArray } from 'drizzle-orm'
import { db } from '~/lib/db'
import { orgs, orgMembers, teams, teamMembers, environments, projects, envPermissions, sessions } from '~/lib/schema'
import { auditLog } from '~/lib/db-utils'
import { requireAuth, errorResponse } from '~/lib/auth'
import { requireOrgRole, ORG_ROLE_OWNER, ORG_ROLE_ADMIN, ORG_ROLE_MEMBER } from '~/lib/rbac'
import { syncOrgSeats } from '~/lib/plans'

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

          // All cleanup in one transaction: a partial failure would
          // resurrect old access when the user is re-invited.
          await db.transaction(async (tx) => {
            await tx.delete(orgMembers)
              .where(and(eq(orgMembers.org_id, orgId), eq(orgMembers.user_id, targetUserId)))
            // No CASCADE by convention: drop their team memberships in this org
            // (soft-deleted teams included) so a later re-invite doesn't
            // silently resurrect old team access.
            await tx.delete(teamMembers)
              .where(and(
                eq(teamMembers.user_id, targetUserId),
                inArray(teamMembers.team_id, tx.select({ id: teams.id }).from(teams).where(eq(teams.org_id, orgId))),
              ))
            // Drop their direct env_permissions for environments in this org too,
            // so re-inviting them doesn't silently resurrect old per-env RBAC
            // grants. Matches the team-membership cleanup above.
            await tx.delete(envPermissions)
              .where(and(
                eq(envPermissions.user_id, targetUserId),
                inArray(envPermissions.env_id,
                  tx.select({ id: environments.id }).from(environments)
                    .innerJoin(projects, eq(projects.id, environments.project_id))
                    .where(eq(projects.org_id, orgId))),
              ))
            // Blast radius is this org only: token sessions keep their other
            // orgs' keys (personal-org CI stays alive) with this org's entry
            // stripped; interactive sessions are revoked outright. A token
            // session with unparsable key data falls back to revocation.
            const liveSessions = await tx.select().from(sessions)
              .where(and(eq(sessions.user_id, targetUserId), isNull(sessions.revoked_at)))
            for (const s of liveSessions) {
              if (s.kind !== 'token') {
                await tx.update(sessions).set({ revoked_at: new Date() }).where(eq(sessions.id, s.id))
                continue
              }
              let orgKeys: Record<string, string>
              try {
                orgKeys = JSON.parse(s.encrypted_org_keys)
                if (typeof orgKeys !== 'object' || orgKeys === null || Array.isArray(orgKeys)) {
                  throw new Error('not an org-key map')
                }
              } catch {
                await tx.update(sessions).set({ revoked_at: new Date() }).where(eq(sessions.id, s.id))
                continue
              }
              if (!(orgId in orgKeys)) continue
              delete orgKeys[orgId]
              await tx.update(sessions).set({ encrypted_org_keys: JSON.stringify(orgKeys) }).where(eq(sessions.id, s.id))
            }
          })
          await auditLog({ orgId, actorUserId: user.id, action: 'member.remove', targetType: 'user', targetId: targetUserId })
          // Fire-and-forget: smaller roster = fewer billable seats; a Stripe
          // hiccup must not block the removal.
          void syncOrgSeats(orgId)
          return new Response(null, { status: 204 })
        } catch (err) {
          return errorResponse(err)
        }
      },
    },
  },
})
