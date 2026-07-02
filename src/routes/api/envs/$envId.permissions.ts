import { createFileRoute } from '@tanstack/react-router'
import { z } from 'zod'
import { db } from '~/lib/db'
import { auditLog } from '~/lib/db-utils'
import { requireAuth, errorResponse } from '~/lib/auth'
import { requireEnvRole, ROLE_READ, ROLE_WRITE, ROLE_ADMIN } from '~/lib/rbac'
import type { EnvPermissionRow } from '~/lib/types'

const grantSchema = z.object({
  userId: z.string(),
  role: z.enum([ROLE_READ, ROLE_WRITE, ROLE_ADMIN]),
})

export const Route = createFileRoute('/api/envs/$envId/permissions')({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        try {
          const { user } = await requireAuth(request)
          await requireEnvRole(params, user.id, [ROLE_READ, ROLE_WRITE, ROLE_ADMIN])
          const envId = params.envId!
          const result = await db.prepare(
            'SELECT * FROM env_permissions WHERE env_id = ?'
          ).bind(envId).all<EnvPermissionRow>()
          return Response.json(result.results, { status: 200 })
        } catch (err) {
          return errorResponse(err)
        }
      },

      POST: async ({ request, params }) => {
        try {
          const { user } = await requireAuth(request)
          const orgId = await requireEnvRole(params, user.id, [ROLE_ADMIN])
          const envId = params.envId!
          const { userId, role } = grantSchema.parse(await request.json())

          const existing = await db.prepare(
            'SELECT * FROM env_permissions WHERE env_id = ? AND user_id = ?'
          ).bind(envId, userId).first()
          if (existing) return Response.json({ error: 'Permission already exists' }, { status: 409 })

          await db.prepare(
            'INSERT INTO env_permissions (env_id, user_id, role) VALUES (?, ?, ?)'
          ).bind(envId, userId, role).run()

          await auditLog({ orgId, actorUserId: user.id, action: 'env.permission.grant', targetType: 'env', targetId: envId, metadata: { userId, role } })

          const perm = await db.prepare(
            'SELECT * FROM env_permissions WHERE env_id = ? AND user_id = ?'
          ).bind(envId, userId).first<EnvPermissionRow>()
          return Response.json(perm, { status: 201 })
        } catch (err) {
          return errorResponse(err)
        }
      },
    },
  },
})
