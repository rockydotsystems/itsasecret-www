import { createFileRoute } from '@tanstack/react-router'
import { eq, and, isNull } from 'drizzle-orm'
import { db } from '~/lib/db'
import { envVars } from '~/lib/schema'
import { requireAuth, errorResponse } from '~/lib/auth'
import { requireEnvRole, ROLE_READ, ROLE_WRITE, ROLE_ADMIN } from '~/lib/rbac'

export const Route = createFileRoute('/api/envs/$envId/vars')({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        try {
          const { user } = await requireAuth(request)
          await requireEnvRole(params, user.id, [ROLE_READ, ROLE_WRITE, ROLE_ADMIN])
          const envId = params.envId!
          const rows = await db.select({
            key: envVars.key,
            value: envVars.value,
          }).from(envVars)
            .where(and(eq(envVars.env_id, envId), isNull(envVars.deleted_at)))
          return Response.json(rows, { status: 200 })
        } catch (err) {
          return errorResponse(err)
        }
      },
    },
  },
})
