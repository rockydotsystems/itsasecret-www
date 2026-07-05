import { createFileRoute } from '@tanstack/react-router'
import { eq, and } from 'drizzle-orm'
import { db } from '~/lib/db'
import { orgMembers } from '~/lib/schema'
import { requireAuth, errorResponse } from '~/lib/auth'
import { isPendingOrgKey } from '~/lib/pending-org-key'

// Returns the caller's own org key, wrapped under their master key. Handing
// this out is safe: only the caller's master password can unwrap it. Used by
// the web vault to decrypt/encrypt secrets client-side (E2E flow).
export const Route = createFileRoute('/api/orgs/$orgId/key')({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        try {
          const { user } = await requireAuth(request)
          const orgId = params.orgId!

          const rows = await db.select({ wrapped_org_key: orgMembers.wrapped_org_key }).from(orgMembers)
            .where(and(eq(orgMembers.org_id, orgId), eq(orgMembers.user_id, user.id)))
            .limit(1)
          const member = rows[0] ?? null
          if (!member) return Response.json({ error: 'Not a member of this organization' }, { status: 403 })

          // Invite re-key not finished yet - the key is still wrapped under the
          // server secret, not the caller's master key. A fresh login fixes it.
          if (isPendingOrgKey(member.wrapped_org_key)) {
            return Response.json({ error: 'Key setup pending. Log out and back in to finish it.' }, { status: 409 })
          }

          return Response.json({ wrappedOrgKey: member.wrapped_org_key }, { status: 200 })
        } catch (err) {
          return errorResponse(err)
        }
      },
    },
  },
})
