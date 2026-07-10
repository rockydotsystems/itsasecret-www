import { createFileRoute } from '@tanstack/react-router'
import { z } from 'zod'
import { eq, and, isNull } from 'drizzle-orm'
import { db } from '~/lib/db'
import { users, orgs, orgMembers, orgInvites } from '~/lib/schema'
import { auditLog } from '~/lib/db-utils'
import { requireAuth, errorResponse } from '~/lib/auth'
import { findPendingInviteByToken } from '~/lib/org-invites'
import { isRateLimited, recordFailedAttempt } from '~/lib/rate-limit'

const acceptSchema = z.object({
  token: z.string().max(256),
})

// Accepting an invite creates the org_members row with the invite's
// "pending:" wrapped org key; the invitee's next login re-wraps it under
// their master key (same flow as before invites had an accept step).
//
// Unverified accounts may accept: the token was emailed to the invite
// address, so presenting it while logged in as that address proves inbox
// control - which is exactly what email verification proves. We stamp the
// account verified on that basis.
export const Route = createFileRoute('/api/invites/accept')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const { user } = await requireAuth(request, { allowUnverified: true })
          const rateKey = `invite-accept:${user.id}`
          const rateLimit = isRateLimited(rateKey)
          if (rateLimit.limited) {
            return Response.json(
              { error: 'Too many requests. Please try again later.' },
              { status: 429, headers: { 'Retry-After': String(rateLimit.retryAfterSeconds) } }
            )
          }
          recordFailedAttempt(rateKey)
          const { token } = acceptSchema.parse(await request.json())

          const invite = await findPendingInviteByToken(token)
          if (!invite) return Response.json({ error: 'Invite not found, revoked, or expired' }, { status: 404 })

          if (user.email.toLowerCase() !== invite.email) {
            return Response.json({ error: 'This invitation was sent to a different email address' }, { status: 403 })
          }

          const orgRows = await db.select().from(orgs)
            .where(and(eq(orgs.id, invite.org_id), isNull(orgs.deleted_at)))
            .limit(1)
          const org = orgRows[0] ?? null
          if (!org) return Response.json({ error: 'Organization no longer exists' }, { status: 410 })

          const now = new Date()

          const memberRows = await db.select().from(orgMembers)
            .where(and(eq(orgMembers.org_id, org.id), eq(orgMembers.user_id, user.id)))
            .limit(1)
          if (memberRows[0]) {
            // Already in (e.g. double-click, or added through another invite):
            // consume the token and report success rather than erroring.
            await db.update(orgInvites).set({ accepted_at: now }).where(eq(orgInvites.id, invite.id))
            return Response.json({ org_id: org.id, org_name: org.name, role: memberRows[0].role }, { status: 200 })
          }

          await db.insert(orgMembers).values({
            org_id: org.id,
            user_id: user.id,
            role: invite.role,
            wrapped_org_key: invite.wrapped_org_key,
            invited_by: invite.invited_by,
          })
          await db.update(orgInvites).set({ accepted_at: now }).where(eq(orgInvites.id, invite.id))

          if (user.email_verified_at === null) {
            await db.update(users).set({ email_verified_at: now }).where(eq(users.id, user.id))
          }

          await auditLog({ orgId: org.id, actorUserId: user.id, action: 'member.invite.accept', targetType: 'user', targetId: user.id, metadata: { role: invite.role } })

          return Response.json({ org_id: org.id, org_name: org.name, role: invite.role }, { status: 200 })
        } catch (err) {
          return errorResponse(err)
        }
      },
    },
  },
})
