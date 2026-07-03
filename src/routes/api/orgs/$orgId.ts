import { createFileRoute } from '@tanstack/react-router'
import { z } from 'zod'
import { eq, and, isNull } from 'drizzle-orm'
import { db } from '~/lib/db'
import { orgs, orgMembers } from '~/lib/schema'
import { auditLog, softDeleteOrg } from '~/lib/db-utils'
import { requireAuth, errorResponse } from '~/lib/auth'
import { requireOrgRole, ORG_ROLE_OWNER, ORG_ROLE_ADMIN, ORG_ROLE_MEMBER } from '~/lib/rbac'

const updateSchema = z.object({
  name: z.string().min(1).optional(),
  ownerUserId: z.string().optional(),
})

export const Route = createFileRoute('/api/orgs/$orgId')({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        try {
          const { user } = await requireAuth(request)
          await requireOrgRole(params, user.id, [ORG_ROLE_OWNER, ORG_ROLE_ADMIN, ORG_ROLE_MEMBER])
          const orgId = params.orgId!
          const rows = await db.select().from(orgs)
            .where(and(eq(orgs.id, orgId), isNull(orgs.deleted_at)))
            .limit(1)
          const org = rows[0] ?? null
          if (!org) return Response.json({ error: 'Org not found' }, { status: 404 })
          return Response.json(org, { status: 200 })
        } catch (err) {
          return errorResponse(err)
        }
      },

      PATCH: async ({ request, params }) => {
        try {
          const { user } = await requireAuth(request)
          await requireOrgRole(params, user.id, [ORG_ROLE_OWNER, ORG_ROLE_ADMIN])
          const orgId = params.orgId!
          const body = updateSchema.parse(await request.json())

          const orgRows = await db.select().from(orgs)
            .where(and(eq(orgs.id, orgId), isNull(orgs.deleted_at)))
            .limit(1)
          const org = orgRows[0] ?? null
          if (!org) return Response.json({ error: 'Org not found' }, { status: 404 })

          if (body.name) {
            await db.update(orgs).set({ name: body.name }).where(eq(orgs.id, orgId))
          }

          if (body.ownerUserId && body.ownerUserId !== org.owner_user_id) {
            if (org.owner_user_id !== user.id) {
              return Response.json({ error: 'Only the org owner can transfer ownership' }, { status: 403 })
            }
            if (org.kind === 'personal') {
              return Response.json({ error: 'Personal organizations cannot be transferred' }, { status: 403 })
            }
            const newOwnerRows = await db.select().from(orgMembers)
              .where(and(eq(orgMembers.org_id, orgId), eq(orgMembers.user_id, body.ownerUserId)))
              .limit(1)
            const newOwner = newOwnerRows[0] ?? null
            if (!newOwner) return Response.json({ error: 'New owner is not a member' }, { status: 404 })

            await db.update(orgs).set({ owner_user_id: body.ownerUserId }).where(eq(orgs.id, orgId))
            await db.update(orgMembers).set({ role: ORG_ROLE_OWNER })
              .where(and(eq(orgMembers.org_id, orgId), eq(orgMembers.user_id, body.ownerUserId)))
            await db.update(orgMembers).set({ role: ORG_ROLE_ADMIN })
              .where(and(eq(orgMembers.org_id, orgId), eq(orgMembers.user_id, org.owner_user_id)))

            await auditLog({ orgId, actorUserId: user.id, action: 'org.transfer', targetType: 'org', targetId: orgId, metadata: { newOwner: body.ownerUserId } })
          }

          const updatedRows = await db.select().from(orgs).where(eq(orgs.id, orgId)).limit(1)
          return Response.json(updatedRows[0], { status: 200 })
        } catch (err) {
          return errorResponse(err)
        }
      },

      DELETE: async ({ request, params }) => {
        try {
          const { user } = await requireAuth(request)
          await requireOrgRole(params, user.id, [ORG_ROLE_OWNER])
          const orgId = params.orgId!
          const orgRows = await db.select().from(orgs)
            .where(and(eq(orgs.id, orgId), isNull(orgs.deleted_at)))
            .limit(1)
          const org = orgRows[0] ?? null
          if (!org) return Response.json({ error: 'Org not found' }, { status: 404 })
          if (org.kind === 'personal') {
            return Response.json({ error: 'Personal organizations cannot be deleted' }, { status: 403 })
          }
          await softDeleteOrg(orgId)
          await auditLog({ orgId, actorUserId: user.id, action: 'org.delete', targetType: 'org', targetId: orgId })
          return new Response(null, { status: 204 })
        } catch (err) {
          return errorResponse(err)
        }
      },
    },
  },
})
