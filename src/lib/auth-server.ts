import { createServerFn } from '@tanstack/react-start'
import { getCookie } from '@tanstack/react-start/server'
import { eq, and, isNull } from 'drizzle-orm'
import { db } from '~/lib/db'
import { orgs, orgMembers } from '~/lib/schema'
import { getCurrentUserFromRequest } from '~/lib/auth'
import type { CurrentUser } from '~/lib/auth-form'

// What route guards see: the session user plus whether they belong to any
// live org — verified users without one are forced through /onboarding.
export interface SessionUser extends CurrentUser {
  has_orgs: boolean
}

export const getCurrentUserFn = createServerFn({ method: 'GET' })
  .handler(async (): Promise<SessionUser | null> => {
    const token = getCookie('session_token')
    if (!token) return null

    const request = new Request('http://localhost', {
      headers: { Authorization: `Bearer ${token}` },
    })

    const user = await getCurrentUserFromRequest(request)
    if (!user) return null

    const memberRows = await db.select({ org_id: orgMembers.org_id }).from(orgMembers)
      .innerJoin(orgs, and(eq(orgs.id, orgMembers.org_id), isNull(orgs.deleted_at)))
      .where(eq(orgMembers.user_id, user.id))
      .limit(1)

    return {
      id: user.id,
      email: user.email,
      kdf_salt: user.kdf_salt,
      kdf_params: user.kdf_params,
      email_verified: user.email_verified_at !== null,
      has_orgs: memberRows.length > 0,
    }
  })
