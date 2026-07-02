import { createFileRoute } from '@tanstack/react-router'
import { requireAuth, errorResponse } from '~/lib/auth'
import { revokeSession } from '~/lib/sessions'
import { auditLog } from '~/lib/db-utils'
import { createClearSessionCookieHeader } from '~/lib/session-cookie'

export const Route = createFileRoute('/api/auth/logout')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const { user, session } = await requireAuth(request)
          await revokeSession(session.id)
          await auditLog({ actorUserId: user.id, action: 'user.logout' })

          const headers = new Headers()
          headers.set('Set-Cookie', createClearSessionCookieHeader())

          return new Response(null, { status: 204, headers })
        } catch (err) {
          return errorResponse(err)
        }
      },
    },
  },
})
