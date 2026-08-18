import { createFileRoute } from '@tanstack/react-router'
import { z } from 'zod'
import { eq, and, isNull, isNotNull } from 'drizzle-orm'
import { db } from '~/lib/db'
import { envVars, envVarHistory } from '~/lib/schema'
import { generateId, auditLog, softDeleteEnvVar, isUniqueViolation } from '~/lib/db-utils'
import { requireAuth, errorResponse, validateKey } from '~/lib/auth'
import { requireEnvRole, ROLE_WRITE, ROLE_ADMIN } from '~/lib/rbac'
import { recordVarHistory } from '~/lib/history'
import { encrypt } from '~/lib/crypto/envelope'
import { getServerSecretKey } from '~/lib/server-secret'

const upsertSchema = z.object({
  value: z.string().max(65536),
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
          validateKey(key)
          const { value } = upsertSchema.parse(await request.json())

          try {
            await db.transaction(async (tx) => {
              const existingRows = await tx.select().from(envVars)
                .where(and(eq(envVars.env_id, envId), eq(envVars.key, key), isNull(envVars.deleted_at)))
                .limit(1)
                .for('update')
              const existing = existingRows[0] ?? null

              if (existing) {
                // History snapshot + update share the tx (and the row lock)
                // so last-write-wins can never silently drop a value.
                const serverKey = await getServerSecretKey()
                await tx.insert(envVarHistory).values({
                  id: generateId(),
                  var_id: existing.id,
                  env_id: envId,
                  key,
                  encrypted_value: await encrypt(serverKey, existing.value),
                  change_type: 'update',
                  changed_by: user.id,
                })
                await tx.update(envVars)
                  .set({ value, updated_at: new Date() })
                  .where(eq(envVars.id, existing.id))
              } else {
                // hidden_at rows are perma-deleted: never resurrect them.
                const deletedRows = await tx.select({ id: envVars.id }).from(envVars)
                  .where(and(eq(envVars.env_id, envId), eq(envVars.key, key), isNotNull(envVars.deleted_at), isNull(envVars.hidden_at)))
                  .limit(1)
                  .for('update')
                const deleted = deletedRows[0] ?? null

                if (deleted) {
                  await tx.update(envVars)
                    .set({ value, deleted_at: null, hidden_at: null, updated_at: new Date() })
                    .where(eq(envVars.id, deleted.id))
                } else {
                  const varId = generateId()
                  await tx.insert(envVars).values({
                    id: varId,
                    env_id: envId,
                    key,
                    value,
                    created_by: user.id,
                  })
                }
              }
            })
          } catch (err) {
            if (isUniqueViolation(err)) {
              return Response.json({ error: 'Var already exists' }, { status: 409 })
            }
            throw err
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
          validateKey(key)

          const existingRows = await db.select().from(envVars)
            .where(and(eq(envVars.env_id, envId), eq(envVars.key, key), isNull(envVars.deleted_at)))
            .limit(1)
          const existing = existingRows[0] ?? null
          if (!existing) return Response.json({ error: 'Var not found' }, { status: 404 })

          await recordVarHistory({
            varId: existing.id,
            envId,
            key,
            value: existing.value,
            changeType: 'delete',
            changedBy: user.id,
          })
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
