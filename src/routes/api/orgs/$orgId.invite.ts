import { createFileRoute } from '@tanstack/react-router'
import { z } from 'zod'
import { eq, and, isNull, sql } from 'drizzle-orm'
import { db } from '~/lib/db'
import { users, orgs, orgMembers } from '~/lib/schema'
import { auditLog } from '~/lib/db-utils'
import { requireAuth, errorResponse, getSessionKey, getOrgKey } from '~/lib/auth'
import { requireOrgRole, ORG_ROLE_OWNER, ORG_ROLE_ADMIN, ORG_ROLE_MEMBER } from '~/lib/rbac'
import { wrapPendingOrgKey } from '~/lib/pending-org-key'
import { createOrgInvite, inviteAcceptUrl, normalizeInviteEmail } from '~/lib/org-invites'
import { sendOrgInviteEmail } from '~/lib/email'
import { isRateLimited, recordFailedAttempt } from '~/lib/rate-limit'

const inviteSchema = z.object({
  email: z.string().email(),
  role: z.enum([ORG_ROLE_ADMIN, ORG_ROLE_MEMBER]),
})

// Inviting emails a single-use accept link; membership is only created when
// the invitee accepts (POST /api/invites/accept), so the invitee doesn't need
// an account yet. The inviter cannot wrap the org key with the invitee's
// master key, so the caller supplies its session key (X-Session-Key), the
// server recovers the org key from the session and stores it server-wrapped
// as "pending:" on the invite. Acceptance copies it onto the member row and
// the invitee's next login re-wraps it under their master key.
export const Route = createFileRoute('/api/orgs/$orgId/invite')({
  server: {
    handlers: {
      POST: async ({ request, params }) => {
        try {
          const { user, session } = await requireAuth(request)
          await requireOrgRole(params, user.id, [ORG_ROLE_OWNER, ORG_ROLE_ADMIN])
          const orgId = params.orgId!
          const body = inviteSchema.parse(await request.json())
          const email = normalizeInviteEmail(body.email)
          const { role } = body

          // Rate limit per inviter and per org: each invite sends a real email
          // via Resend, so an abusive admin could spam inboxes and inflate
          // costs. The shared 15-min/10-attempt bucket is tight enough to stop
          // a burst while leaving normal use unaffected.
          const inviterLimit = isRateLimited(`invite:${user.id}`)
          if (inviterLimit.limited) {
            return Response.json(
              { error: 'Too many invites. Please try again later.' },
              { status: 429, headers: { 'Retry-After': String(inviterLimit.retryAfterSeconds) } }
            )
          }
          const orgLimit = isRateLimited(`invite-org:${orgId}`)
          if (orgLimit.limited) {
            return Response.json(
              { error: 'Too many invites from this organization. Please try again later.' },
              { status: 429, headers: { 'Retry-After': String(orgLimit.retryAfterSeconds) } }
            )
          }
          recordFailedAttempt(`invite:${user.id}`)
          recordFailedAttempt(`invite-org:${orgId}`)

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

          // The invitee may not have an account yet - that's fine, they can
          // register from the accept page. Only reject if they are already in.
          const userRows = await db.select().from(users)
            .where(sql`lower(${users.email}) = ${email}`)
            .limit(1)
          const invitee = userRows[0] ?? null
          if (invitee) {
            const existingRows = await db.select().from(orgMembers)
              .where(and(eq(orgMembers.org_id, orgId), eq(orgMembers.user_id, invitee.id)))
              .limit(1)
            if (existingRows[0]) return Response.json({ error: 'User is already a member' }, { status: 409 })
          }

          const { token } = await createOrgInvite({
            orgId,
            email,
            role,
            invitedBy: user.id,
            wrappedOrgKey: await wrapPendingOrgKey(orgKey),
          })

          await sendOrgInviteEmail({
            to: email,
            orgName: org.name,
            inviterEmail: user.email,
            role,
            acceptUrl: inviteAcceptUrl(request, token),
          })

          await auditLog({ orgId, actorUserId: user.id, action: 'member.invite', targetType: 'email', targetId: email, metadata: { role } })

          return Response.json({
            org_id: orgId,
            email,
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
