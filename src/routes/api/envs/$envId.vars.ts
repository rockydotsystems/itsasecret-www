import { createFileRoute } from '@tanstack/react-router'
import { db } from '~/lib/db'
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
          const result = await db.prepare(
            'SELECT key, value FROM env_vars WHERE env_id = ? AND deleted_at IS NULL'
          ).bind(envId).all<{ key: string; value: string }>()
          return Response.json(result.results, { status: 200 })
        } catch (err) {
          return errorResponse(err)
        }
      },
    },
  },
})
