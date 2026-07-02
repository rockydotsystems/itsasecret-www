import { createFileRoute } from '@tanstack/react-router'
import { eq, and, isNull } from 'drizzle-orm'
import { db } from '~/lib/db'
import { secrets } from '~/lib/schema'
import { requireAuth, errorResponse } from '~/lib/auth'
import { requireEnvRole, ROLE_READ, ROLE_WRITE, ROLE_ADMIN } from '~/lib/rbac'

export const Route = createFileRoute('/api/envs/$envId/secrets')({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        try {
          const { user } = await requireAuth(request)
          await requireEnvRole(params, user.id, [ROLE_READ, ROLE_WRITE, ROLE_ADMIN])
          const envId = params.envId!
          const rows = await db.select({
            key: secrets.key,
            created_at: secrets.created_at,
            updated_at: secrets.updated_at,
          }).from(secrets)
            .where(and(eq(secrets.env_id, envId), isNull(secrets.deleted_at)))
          return Response.json(rows, { status: 200 })
        } catch (err) {
          return errorResponse(err)
        }
      },
    },
  },
})
