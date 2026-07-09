import { createFileRoute } from '@tanstack/react-router'
import { requireAuth, errorResponse } from '~/lib/auth'
import { revokeSession } from '~/lib/sessions'
import { auditLog } from '~/lib/db-utils'
import { createClearSessionCookieHeader } from '~/lib/session-cookie'

function isSecureRequest(request: Request): boolean {
  const url = new URL(request.url)
  return request.headers.get('x-forwarded-proto') === 'https' || url.protocol === 'https:'
}

export const Route = createFileRoute('/api/auth/logout')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          // Unverified users must still be able to log out.
          const { user, session } = await requireAuth(request, { allowUnverified: true })
          await revokeSession(session.id)
          await auditLog({ actorUserId: user.id, action: 'user.logout' })

          const headers = new Headers()
          // Match the Secure flag used when the cookie was set, so the clearing
          // Set-Cookie actually replaces it over HTTPS.
          headers.set('Set-Cookie', createClearSessionCookieHeader(isSecureRequest(request)))

          return new Response(null, { status: 204, headers })
        } catch (err) {
          return errorResponse(err)
        }
      },
    },
  },
})
