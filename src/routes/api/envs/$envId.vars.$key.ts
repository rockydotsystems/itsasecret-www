import { createFileRoute } from '@tanstack/react-router'
import { z } from 'zod'
import { eq, and, isNull, isNotNull } from 'drizzle-orm'
import { db } from '~/lib/db'
import { envVars } from '~/lib/schema'
import { generateId, auditLog, softDeleteEnvVar } from '~/lib/db-utils'
import { requireAuth, errorResponse } from '~/lib/auth'
import { requireEnvRole, ROLE_WRITE, ROLE_ADMIN } from '~/lib/rbac'

const upsertSchema = z.object({
  value: z.string(),
})

export const Route = createFileRoute('/api/envs/$envId/vars/$key')({
  server: {
    handlers: {
      PUT: async ({ request, params }) => {
        try {
          const { user } = await requireAuth(request)
          const orgId = await requireEnvRole(params, user.id, [ROLE_WRITE, ROLE_ADMIN])
          const envId = params.envId!
          const key = params.key!
          const { value } = upsertSchema.parse(await request.json())

          const existingRows = await db.select().from(envVars)
            .where(and(eq(envVars.env_id, envId), eq(envVars.key, key), isNull(envVars.deleted_at)))
            .limit(1)
          const existing = existingRows[0] ?? null

          if (existing) {
            await db.update(envVars)
              .set({ value, updated_at: new Date() })
              .where(eq(envVars.id, existing.id))
          } else {
            const deletedRows = await db.select({ id: envVars.id }).from(envVars)
              .where(and(eq(envVars.env_id, envId), eq(envVars.key, key), isNotNull(envVars.deleted_at)))
              .limit(1)
            const deleted = deletedRows[0] ?? null

            if (deleted) {
              await db.update(envVars)
                .set({ value, deleted_at: null, updated_at: new Date() })
                .where(eq(envVars.id, deleted.id))
            } else {
              const varId = generateId()
              await db.insert(envVars).values({
                id: varId,
                env_id: envId,
                key,
                value,
                created_by: user.id,
              })
            }
          }

          await auditLog({ orgId, actorUserId: user.id, action: 'var.upsert', targetType: 'env_var', targetId: key, metadata: { envId } })

          return Response.json({ key, value }, { status: 200 })
        } catch (err) {
          return errorResponse(err)
        }
      },

      DELETE: async ({ request, params }) => {
        try {
          const { user } = await requireAuth(request)
          const orgId = await requireEnvRole(params, user.id, [ROLE_WRITE, ROLE_ADMIN])
          const envId = params.envId!
          const key = params.key!

          const existingRows = await db.select({ id: envVars.id }).from(envVars)
            .where(and(eq(envVars.env_id, envId), eq(envVars.key, key), isNull(envVars.deleted_at)))
            .limit(1)
          const existing = existingRows[0] ?? null
          if (!existing) return Response.json({ error: 'Var not found' }, { status: 404 })

          await softDeleteEnvVar(existing.id)
          await auditLog({ orgId, actorUserId: user.id, action: 'var.delete', targetType: 'env_var', targetId: key, metadata: { envId } })
          return new Response(null, { status: 204 })
        } catch (err) {
          return errorResponse(err)
        }
      },
    },
  },
})
