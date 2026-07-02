import { createFileRoute } from '@tanstack/react-router'
import { db } from '~/lib/db'
import { auditLog, softDelete } from '~/lib/db-utils'
import { requireAuth, errorResponse } from '~/lib/auth'
import { requireEnvRole, ROLE_READ, ROLE_WRITE, ROLE_ADMIN } from '~/lib/rbac'
import type { EnvRow } from '~/lib/types'

export const Route = createFileRoute('/api/envs/$envId')({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        try {
          const { user } = await requireAuth(request)
          await requireEnvRole(params, user.id, [ROLE_READ, ROLE_WRITE, ROLE_ADMIN])
          const envId = params.envId!
          const env = await db.prepare('SELECT * FROM environments WHERE id = ? AND deleted_at IS NULL').bind(envId).first<EnvRow>()
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
          await softDelete('environments', envId)
          await auditLog({ orgId, actorUserId: user.id, action: 'env.delete', targetType: 'env', targetId: envId })
          return new Response(null, { status: 204 })
        } catch (err) {
          return errorResponse(err)
        }
      },
    },
  },
})
