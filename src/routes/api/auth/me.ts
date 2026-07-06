import { createFileRoute } from '@tanstack/react-router'
import { z } from 'zod'
import { eq } from 'drizzle-orm'
import { db } from '~/lib/db'
import { users } from '~/lib/schema'
import { auditLog } from '~/lib/db-utils'
import { requireAuth, errorResponse } from '~/lib/auth'

const updateProfileSchema = z.object({
  name: z.string().trim().max(100),
})

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
              name: user.name,
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
      // Profile update - currently just the display name. Clearing the field
      // stores null so "no name" stays one state, not '' and null.
      PATCH: async ({ request }) => {
        try {
          const { user } = await requireAuth(request)
          const body = updateProfileSchema.parse(await request.json())
          const name = body.name === '' ? null : body.name
          await db.update(users)
            .set({ name, updated_at: new Date() })
            .where(eq(users.id, user.id))
          await auditLog({ actorUserId: user.id, action: 'user.update_profile', targetType: 'user', targetId: user.id })
          return Response.json({ name }, { status: 200 })
        } catch (err) {
          return errorResponse(err)
        }
      },
    },
  },
})
