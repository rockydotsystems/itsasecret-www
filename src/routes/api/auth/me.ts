import { createFileRoute } from '@tanstack/react-router'
import { requireAuth, errorResponse } from '~/lib/auth'

export const Route = createFileRoute('/api/auth/me')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          const { user } = await requireAuth(request)
          return Response.json({
            user: {
              id: user.id,
              email: user.email,
              kdf_salt: user.kdf_salt,
              kdf_params: user.kdf_params,
            },
          }, { status: 200 })
        } catch (err) {
          return errorResponse(err)
        }
      },
    },
  },
})
