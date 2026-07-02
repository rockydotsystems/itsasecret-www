import { createFileRoute } from '@tanstack/react-router'
import { z } from 'zod'
import { db } from '~/lib/db'
import { auditLog, softDelete } from '~/lib/db-utils'
import { requireAuth, errorResponse } from '~/lib/auth'
import { requireOrgRole, ORG_ROLE_OWNER, ORG_ROLE_ADMIN, ORG_ROLE_MEMBER } from '~/lib/rbac'
import type { OrgRow, OrgMemberRow } from '~/lib/types'

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
          const org = await db.prepare('SELECT * FROM orgs WHERE id = ? AND deleted_at IS NULL').bind(orgId).first<OrgRow>()
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

          const org = await db.prepare('SELECT * FROM orgs WHERE id = ? AND deleted_at IS NULL').bind(orgId).first<OrgRow>()
          if (!org) return Response.json({ error: 'Org not found' }, { status: 404 })

          if (body.name) {
            await db.prepare('UPDATE orgs SET name = ? WHERE id = ?').bind(body.name, orgId).run()
          }

          if (body.ownerUserId) {
            const newOwner = await db.prepare(
              'SELECT * FROM org_members WHERE org_id = ? AND user_id = ?'
            ).bind(orgId, body.ownerUserId).first<OrgMemberRow>()
            if (!newOwner) return Response.json({ error: 'New owner is not a member' }, { status: 404 })

            await db.prepare('UPDATE orgs SET owner_user_id = ? WHERE id = ?').bind(body.ownerUserId, orgId).run()
            await db.prepare('UPDATE org_members SET role = ? WHERE org_id = ? AND user_id = ?')
              .bind(ORG_ROLE_OWNER, orgId, body.ownerUserId).run()
            await db.prepare('UPDATE org_members SET role = ? WHERE org_id = ? AND user_id = ?')
              .bind(ORG_ROLE_ADMIN, orgId, org.owner_user_id).run()

            await auditLog({ orgId, actorUserId: user.id, action: 'org.transfer', targetType: 'org', targetId: orgId, metadata: { newOwner: body.ownerUserId } })
          }

          const updated = await db.prepare('SELECT * FROM orgs WHERE id = ?').bind(orgId).first<OrgRow>()
          return Response.json(updated, { status: 200 })
        } catch (err) {
          return errorResponse(err)
        }
      },

      DELETE: async ({ request, params }) => {
        try {
          const { user } = await requireAuth(request)
          await requireOrgRole(params, user.id, [ORG_ROLE_OWNER])
          const orgId = params.orgId!
          await softDelete('orgs', orgId)
          await auditLog({ orgId, actorUserId: user.id, action: 'org.delete', targetType: 'org', targetId: orgId })
          return new Response(null, { status: 204 })
        } catch (err) {
          return errorResponse(err)
        }
      },
    },
  },
})
