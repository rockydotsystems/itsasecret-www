import { createFileRoute } from '@tanstack/react-router'
import { eq, and, isNull } from 'drizzle-orm'
import { db } from '~/lib/db'
import { sessions } from '~/lib/schema'
import { requireAuth, errorResponse } from '~/lib/auth'

export const Route = createFileRoute('/api/tokens/$tokenId')({
  server: {
    handlers: {
      // Revokes one of the caller's access tokens. Revocation is immediate:
      // requireAuth rejects revoked sessions on the next request.
      DELETE: async ({ request, params }) => {
        try {
          const { user } = await requireAuth(request)
          const updated = await db.update(sessions)
            .set({ revoked_at: new Date() })
            .where(and(
              eq(sessions.id, params.tokenId!),
              eq(sessions.user_id, user.id),
              eq(sessions.kind, 'token'),
              isNull(sessions.revoked_at)
            ))
            .returning({ id: sessions.id })
          if (updated.length === 0) {
            return Response.json({ error: 'Token not found' }, { status: 404 })
          }
          return new Response(null, { status: 204 })
        } catch (err) {
          return errorResponse(err)
        }
      },
    },
  },
})
