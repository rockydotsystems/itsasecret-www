import { createFileRoute } from '@tanstack/react-router'
import { eq, and, isNull } from 'drizzle-orm'
import { db } from '~/lib/db'
import { orgInvites } from '~/lib/schema'
import { auditLog } from '~/lib/db-utils'
import { requireAuth, errorResponse } from '~/lib/auth'
import { requireOrgRole, ORG_ROLE_OWNER, ORG_ROLE_ADMIN } from '~/lib/rbac'

// Revoking kills the emailed accept link immediately. Accepted invites can't
// be revoked - remove the member instead.
export const Route = createFileRoute('/api/orgs/$orgId/invites/$inviteId')({
  server: {
    handlers: {
      DELETE: async ({ request, params }) => {
        try {
          const { user } = await requireAuth(request)
          await requireOrgRole(params, user.id, [ORG_ROLE_OWNER, ORG_ROLE_ADMIN])
          const orgId = params.orgId!
          const inviteId = params.inviteId!

          const rows = await db.select().from(orgInvites)
            .where(and(
              eq(orgInvites.id, inviteId),
              eq(orgInvites.org_id, orgId),
              isNull(orgInvites.accepted_at),
              isNull(orgInvites.revoked_at)
            ))
            .limit(1)
          const invite = rows[0] ?? null
          if (!invite) return Response.json({ error: 'Invite not found' }, { status: 404 })

          await db.update(orgInvites).set({ revoked_at: new Date() })
            .where(eq(orgInvites.id, invite.id))

          await auditLog({ orgId, actorUserId: user.id, action: 'member.invite.revoke', targetType: 'email', targetId: invite.email, metadata: { role: invite.role } })

          return Response.json({ ok: true }, { status: 200 })
        } catch (err) {
          return errorResponse(err)
        }
      },
    },
  },
})
