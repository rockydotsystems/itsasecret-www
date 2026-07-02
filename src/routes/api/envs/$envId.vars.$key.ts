import { createFileRoute } from '@tanstack/react-router'
import { z } from 'zod'
import { db } from '~/lib/db'
import { generateId, auditLog, softDelete } from '~/lib/db-utils'
import { requireAuth, errorResponse } from '~/lib/auth'
import { requireEnvRole, ROLE_READ, ROLE_WRITE, ROLE_ADMIN } from '~/lib/rbac'
import type { EnvVarRow } from '~/lib/types'

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

          const existing = await db.prepare(
            'SELECT * FROM env_vars WHERE env_id = ? AND key = ? AND deleted_at IS NULL'
          ).bind(envId, key).first<EnvVarRow>()

          if (existing) {
            await db.prepare(
              `UPDATE env_vars SET value = ?, updated_at = datetime('now') WHERE id = ?`
            ).bind(value, existing.id).run()
          } else {
            const deleted = await db.prepare(
              'SELECT id FROM env_vars WHERE env_id = ? AND key = ? AND deleted_at IS NOT NULL'
            ).bind(envId, key).first<EnvVarRow>()

            if (deleted) {
              await db.prepare(
                `UPDATE env_vars SET value = ?, deleted_at = NULL, updated_at = datetime('now') WHERE id = ?`
              ).bind(value, deleted.id).run()
            } else {
              const varId = generateId()
              await db.prepare(
                'INSERT INTO env_vars (id, env_id, key, value, created_by) VALUES (?, ?, ?, ?, ?)'
              ).bind(varId, envId, key, value, user.id).run()
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

          const existing = await db.prepare(
            'SELECT id FROM env_vars WHERE env_id = ? AND key = ? AND deleted_at IS NULL'
          ).bind(envId, key).first<EnvVarRow>()
          if (!existing) return Response.json({ error: 'Var not found' }, { status: 404 })

          await softDelete('env_vars', existing.id)
          await auditLog({ orgId, actorUserId: user.id, action: 'var.delete', targetType: 'env_var', targetId: key, metadata: { envId } })
          return new Response(null, { status: 204 })
        } catch (err) {
          return errorResponse(err)
        }
      },
    },
  },
})
