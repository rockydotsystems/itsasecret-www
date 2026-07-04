import { createFileRoute } from '@tanstack/react-router'
import { errorResponse } from '~/lib/auth'
import { consumeEmailVerification } from '~/lib/email-verification'

export const Route = createFileRoute('/api/auth/verify-email')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          const url = new URL(request.url)
          const token = url.searchParams.get('token')
          if (!token) {
            return Response.json({ error: 'Missing token' }, { status: 400 })
          }

          const verified = await consumeEmailVerification(token)
          const status = verified ? '1' : '0'
          // The link is opened in a browser, so redirect back into the app.
          return new Response(null, {
            status: 303,
            headers: { Location: `/login?verified=${status}` },
          })
        } catch (err) {
          return errorResponse(err)
        }
      },
    },
  },
})
