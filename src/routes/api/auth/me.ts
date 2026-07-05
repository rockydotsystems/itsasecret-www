import { createFileRoute } from '@tanstack/react-router'
import { requireAuth, errorResponse } from '~/lib/auth'

export const Route = createFileRoute('/api/auth/me')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          // Reachable while unverified so the client can detect the state.
          const { user, session } = await requireAuth(request, { allowUnverified: true })
          return Response.json({
            user: {
              id: user.id,
              email: user.email,
              kdf_salt: user.kdf_salt,
              kdf_params: user.kdf_params,
              email_verified: user.email_verified_at !== null,
              email_verified_at: user.email_verified_at,
            },
            // Lets clients (notably `shh auth`) learn what they hold.
            session: {
              kind: session.kind,
              expiresAt: session.expires_at.toISOString(),
            },
          }, { status: 200 })
        } catch (err) {
          return errorResponse(err)
        }
      },
    },
  },
})
