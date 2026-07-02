import { createFileRoute } from '@tanstack/react-router'
import { z } from 'zod'
import { eq, and } from 'drizzle-orm'
import { db } from '~/lib/db'
import { users, orgMembers } from '~/lib/schema'
import { auditLog } from '~/lib/db-utils'
import { requireAuth, errorResponse } from '~/lib/auth'
import { requireOrgRole, ORG_ROLE_ADMIN, ORG_ROLE_MEMBER } from '~/lib/rbac'

const inviteSchema = z.object({
  email: z.string().email(),
  role: z.enum([ORG_ROLE_ADMIN, ORG_ROLE_MEMBER]),
  wrappedOrgKey: z.string(),
})

export const Route = createFileRoute('/api/orgs/$orgId/invite')({
  server: {
    handlers: {
      POST: async ({ request, params }) => {
        try {
          const { user } = await requireAuth(request)
          await requireOrgRole(params, user.id, [ORG_ROLE_ADMIN])
          const orgId = params.orgId!
          const body = inviteSchema.parse(await request.json())
          const { email, role, wrappedOrgKey } = body

          const userRows = await db.select().from(users).where(eq(users.email, email)).limit(1)
          const invitee = userRows[0] ?? null
          if (!invitee) return Response.json({ error: 'User not found' }, { status: 404 })

          const existingRows = await db.select().from(orgMembers)
            .where(and(eq(orgMembers.org_id, orgId), eq(orgMembers.user_id, invitee.id)))
            .limit(1)
          if (existingRows[0]) return Response.json({ error: 'User is already a member' }, { status: 409 })

          await db.insert(orgMembers).values({
            org_id: orgId,
            user_id: invitee.id,
            role,
            wrapped_org_key: wrappedOrgKey,
            invited_by: user.id,
          })

          await auditLog({ orgId, actorUserId: user.id, action: 'member.invite', targetType: 'user', targetId: invitee.id, metadata: { role } })

          const memberRows = await db.select({
            org_id: orgMembers.org_id,
            user_id: orgMembers.user_id,
            role: orgMembers.role,
            invited_by: orgMembers.invited_by,
            created_at: orgMembers.created_at,
          }).from(orgMembers)
            .where(and(eq(orgMembers.org_id, orgId), eq(orgMembers.user_id, invitee.id)))
            .limit(1)
          return Response.json(memberRows[0], { status: 201 })
        } catch (err) {
          return errorResponse(err)
        }
      },
    },
  },
})
