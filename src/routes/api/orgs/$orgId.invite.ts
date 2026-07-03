import { createFileRoute } from '@tanstack/react-router'
import { z } from 'zod'
import { eq, and, isNull } from 'drizzle-orm'
import { db } from '~/lib/db'
import { users, orgs, orgMembers } from '~/lib/schema'
import { auditLog } from '~/lib/db-utils'
import { requireAuth, errorResponse, getSessionKey, getOrgKey } from '~/lib/auth'
import { requireOrgRole, ORG_ROLE_OWNER, ORG_ROLE_ADMIN, ORG_ROLE_MEMBER } from '~/lib/rbac'
import { wrapPendingOrgKey } from '~/lib/pending-org-key'

const inviteSchema = z.object({
  email: z.string().email(),
  role: z.enum([ORG_ROLE_ADMIN, ORG_ROLE_MEMBER]),
})

// The inviter cannot wrap the org key with the invitee's master key, so the
// caller supplies its session key (X-Session-Key), the server recovers the
// org key from the session and stores it server-wrapped as "pending:". The
// invitee's next login re-wraps it under their master key.
export const Route = createFileRoute('/api/orgs/$orgId/invite')({
  server: {
    handlers: {
      POST: async ({ request, params }) => {
        try {
          const { user, session } = await requireAuth(request)
          await requireOrgRole(params, user.id, [ORG_ROLE_OWNER, ORG_ROLE_ADMIN])
          const orgId = params.orgId!
          const body = inviteSchema.parse(await request.json())
          const { email, role } = body

          const orgRows = await db.select().from(orgs)
            .where(and(eq(orgs.id, orgId), isNull(orgs.deleted_at)))
            .limit(1)
          const org = orgRows[0] ?? null
          if (!org) return Response.json({ error: 'Org not found' }, { status: 404 })
          if (org.kind === 'personal') {
            return Response.json({ error: 'Personal organizations cannot have additional members' }, { status: 403 })
          }

          const sessionKey = getSessionKey(request.headers.get('X-Session-Key'))
          const orgKey = await getOrgKey(session, sessionKey, orgId)

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
            wrapped_org_key: await wrapPendingOrgKey(orgKey),
            invited_by: user.id,
          })

          await auditLog({ orgId, actorUserId: user.id, action: 'member.invite', targetType: 'user', targetId: invitee.id, metadata: { role } })

          return Response.json({
            org_id: orgId,
            user_id: invitee.id,
            email: invitee.email,
            role,
            invited_by: user.id,
          }, { status: 201 })
        } catch (err) {
          return errorResponse(err)
        }
      },
    },
  },
})
