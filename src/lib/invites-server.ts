import { createServerFn } from '@tanstack/react-start'
import { getCookie } from '@tanstack/react-start/server'
import { z } from 'zod'
import { eq, and, isNull } from 'drizzle-orm'
import { db } from '~/lib/db'
import { users, orgs, orgMembers } from '~/lib/schema'
import { getCurrentUserFromRequest } from '~/lib/auth'
import { SESSION_COOKIE_NAME } from '~/lib/session-cookie'
import { findPendingInviteByToken } from '~/lib/org-invites'

// Everything the public /invite accept page needs. The page is reachable
// logged-out, so viewer is null until they log in or register; `matches`
// gates the accept button (acceptance is bound to the invited address).
export type InvitePageView =
  | { status: 'invalid' }
  | {
      status: 'valid'
      orgName: string
      role: string
      email: string
      inviterEmail: string | null
      viewer: { email: string; matches: boolean; alreadyMember: boolean } | null
    }

export const getInvitePageFn = createServerFn({ method: 'POST' })
  .validator(z.object({ token: z.string() }))
  .handler(async ({ data }): Promise<InvitePageView> => {
    const invite = await findPendingInviteByToken(data.token)
    if (!invite) return { status: 'invalid' }

    const orgRows = await db.select().from(orgs)
      .where(and(eq(orgs.id, invite.org_id), isNull(orgs.deleted_at)))
      .limit(1)
    const org = orgRows[0] ?? null
    if (!org) return { status: 'invalid' }

    const inviterRows = await db.select({ email: users.email }).from(users)
      .where(eq(users.id, invite.invited_by))
      .limit(1)

    let viewer: { email: string; matches: boolean; alreadyMember: boolean } | null = null
    const token = getCookie(SESSION_COOKIE_NAME)
    if (token) {
      const request = new Request('http://localhost', {
        headers: { Authorization: `Bearer ${token}` },
      })
      const user = await getCurrentUserFromRequest(request)
      if (user) {
        const memberRows = await db.select({ org_id: orgMembers.org_id }).from(orgMembers)
          .where(and(eq(orgMembers.org_id, org.id), eq(orgMembers.user_id, user.id)))
          .limit(1)
        viewer = {
          email: user.email,
          matches: user.email.toLowerCase() === invite.email,
          alreadyMember: memberRows.length > 0,
        }
      }
    }

    return {
      status: 'valid',
      orgName: org.name,
      role: invite.role,
      email: invite.email,
      inviterEmail: inviterRows[0]?.email ?? null,
      viewer,
    }
  })
