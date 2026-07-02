import { createFileRoute } from '@tanstack/react-router'
import { z } from 'zod'
import { eq, and } from 'drizzle-orm'
import { db } from '~/lib/db'
import { envPermissions } from '~/lib/schema'
import { auditLog } from '~/lib/db-utils'
import { requireAuth, errorResponse } from '~/lib/auth'
import { requireEnvRole, ROLE_READ, ROLE_WRITE, ROLE_ADMIN } from '~/lib/rbac'

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
          const rows = await db.select().from(envPermissions).where(eq(envPermissions.env_id, envId))
          return Response.json(rows, { status: 200 })
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

          const existingRows = await db.select().from(envPermissions)
            .where(and(eq(envPermissions.env_id, envId), eq(envPermissions.user_id, userId)))
            .limit(1)
          if (existingRows[0]) return Response.json({ error: 'Permission already exists' }, { status: 409 })

          await db.insert(envPermissions).values({
            env_id: envId,
            user_id: userId,
            role,
          })

          await auditLog({ orgId, actorUserId: user.id, action: 'env.permission.grant', targetType: 'env', targetId: envId, metadata: { userId, role } })

          const permRows = await db.select().from(envPermissions)
            .where(and(eq(envPermissions.env_id, envId), eq(envPermissions.user_id, userId)))
            .limit(1)
          return Response.json(permRows[0], { status: 201 })
        } catch (err) {
          return errorResponse(err)
        }
      },
    },
  },
})
