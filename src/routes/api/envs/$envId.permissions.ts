import { createFileRoute } from '@tanstack/react-router'
import { z } from 'zod'
import { eq, and } from 'drizzle-orm'
import { db } from '~/lib/db'
import { envPermissions, orgMembers, users } from '~/lib/schema'
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
          const rows = await db.select({
            env_id: envPermissions.env_id,
            user_id: envPermissions.user_id,
            email: users.email,
            role: envPermissions.role,
            created_at: envPermissions.created_at,
          }).from(envPermissions)
            .innerJoin(users, eq(users.id, envPermissions.user_id))
            .where(eq(envPermissions.env_id, envId))
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

          // Org membership is the gate; RBAC is the layer on top.
          const memberRows = await db.select().from(orgMembers)
            .where(and(eq(orgMembers.org_id, orgId), eq(orgMembers.user_id, userId)))
            .limit(1)
          if (!memberRows[0]) return Response.json({ error: 'User is not a member of this organization' }, { status: 404 })

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
