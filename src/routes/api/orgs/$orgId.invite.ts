import { createFileRoute } from '@tanstack/react-router'
import { z } from 'zod'
import { db } from '~/lib/db'
import { auditLog } from '~/lib/db-utils'
import { requireAuth, errorResponse } from '~/lib/auth'
import { requireOrgRole, ORG_ROLE_ADMIN, ORG_ROLE_MEMBER } from '~/lib/rbac'
import type { UserRow, OrgMemberRow } from '~/lib/types'

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

          const invitee = await db.prepare('SELECT * FROM users WHERE email = ?').bind(email).first<UserRow>()
          if (!invitee) return Response.json({ error: 'User not found' }, { status: 404 })

          const existing = await db.prepare(
            'SELECT * FROM org_members WHERE org_id = ? AND user_id = ?'
          ).bind(orgId, invitee.id).first<OrgMemberRow>()
          if (existing) return Response.json({ error: 'User is already a member' }, { status: 409 })

          await db.prepare(
            'INSERT INTO org_members (org_id, user_id, role, wrapped_org_key, invited_by) VALUES (?, ?, ?, ?, ?)'
          ).bind(orgId, invitee.id, role, wrappedOrgKey, user.id).run()

          await auditLog({ orgId, actorUserId: user.id, action: 'member.invite', targetType: 'user', targetId: invitee.id, metadata: { role } })

          const member = await db.prepare(
            'SELECT org_id, user_id, role, invited_by, created_at FROM org_members WHERE org_id = ? AND user_id = ?'
          ).bind(orgId, invitee.id).first<OrgMemberRow>()
          return Response.json(member, { status: 201 })
        } catch (err) {
          return errorResponse(err)
        }
      },
    },
  },
})
