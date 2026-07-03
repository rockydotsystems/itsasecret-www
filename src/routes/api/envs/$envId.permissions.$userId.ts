import { createFileRoute } from '@tanstack/react-router'
import { z } from 'zod'
import { eq, and } from 'drizzle-orm'
import { db } from '~/lib/db'
import { envPermissions } from '~/lib/schema'
import { auditLog } from '~/lib/db-utils'
import { requireAuth, errorResponse } from '~/lib/auth'
import { requireEnvRole, ROLE_READ, ROLE_WRITE, ROLE_ADMIN } from '~/lib/rbac'

const updateSchema = z.object({
  role: z.enum([ROLE_READ, ROLE_WRITE, ROLE_ADMIN]),
})

export const Route = createFileRoute('/api/envs/$envId/permissions/$userId')({
  server: {
    handlers: {
      PATCH: async ({ request, params }) => {
        try {
          const { user } = await requireAuth(request)
          const orgId = await requireEnvRole(params, user.id, [ROLE_ADMIN])
          const envId = params.envId!
          const targetUserId = params.userId!
          const { role } = updateSchema.parse(await request.json())

          const permRows = await db.select().from(envPermissions)
            .where(and(eq(envPermissions.env_id, envId), eq(envPermissions.user_id, targetUserId)))
            .limit(1)
          if (!permRows[0]) return Response.json({ error: 'Permission not found' }, { status: 404 })

          await db.update(envPermissions).set({ role })
            .where(and(eq(envPermissions.env_id, envId), eq(envPermissions.user_id, targetUserId)))
          await auditLog({ orgId, actorUserId: user.id, action: 'env.permission.update', targetType: 'env', targetId: envId, metadata: { userId: targetUserId, role } })

          return Response.json({ env_id: envId, user_id: targetUserId, role }, { status: 200 })
        } catch (err) {
          return errorResponse(err)
        }
      },

      DELETE: async ({ request, params }) => {
        try {
          const { user } = await requireAuth(request)
          const orgId = await requireEnvRole(params, user.id, [ROLE_ADMIN])
          const envId = params.envId!
          const targetUserId = params.userId!

          await db.delete(envPermissions)
            .where(and(eq(envPermissions.env_id, envId), eq(envPermissions.user_id, targetUserId)))
          await auditLog({ orgId, actorUserId: user.id, action: 'env.permission.revoke', targetType: 'env', targetId: envId, metadata: { userId: targetUserId } })
          return new Response(null, { status: 204 })
        } catch (err) {
          return errorResponse(err)
        }
      },
    },
  },
})
