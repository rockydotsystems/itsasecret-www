import { createFileRoute } from '@tanstack/react-router'
import { eq, and, isNull } from 'drizzle-orm'
import { db } from '~/lib/db'
import { environments } from '~/lib/schema'
import { auditLog, softDeleteEnvironment } from '~/lib/db-utils'
import { requireAuth, errorResponse } from '~/lib/auth'
import { requireEnvRole, ROLE_READ, ROLE_WRITE, ROLE_ADMIN } from '~/lib/rbac'

export const Route = createFileRoute('/api/envs/$envId')({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        try {
          const { user } = await requireAuth(request)
          await requireEnvRole(params, user.id, [ROLE_READ, ROLE_WRITE, ROLE_ADMIN])
          const envId = params.envId!
          const rows = await db.select().from(environments)
            .where(and(eq(environments.id, envId), isNull(environments.deleted_at)))
            .limit(1)
          const env = rows[0] ?? null
          if (!env) return Response.json({ error: 'Environment not found' }, { status: 404 })
          return Response.json(env, { status: 200 })
        } catch (err) {
          return errorResponse(err)
        }
      },

      DELETE: async ({ request, params }) => {
        try {
          const { user } = await requireAuth(request)
          const orgId = await requireEnvRole(params, user.id, [ROLE_ADMIN])
          const envId = params.envId!
          await softDeleteEnvironment(envId)
          await auditLog({ orgId, actorUserId: user.id, action: 'env.delete', targetType: 'env', targetId: envId })
          return new Response(null, { status: 204 })
        } catch (err) {
          return errorResponse(err)
        }
      },
    },
  },
})
