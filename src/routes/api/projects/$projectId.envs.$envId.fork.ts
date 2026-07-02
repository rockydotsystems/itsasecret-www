import { createFileRoute } from '@tanstack/react-router'
import { z } from 'zod'
import { db } from '~/lib/db'
import { generateId, auditLog } from '~/lib/db-utils'
import { requireAuth, errorResponse } from '~/lib/auth'
import { requireEnvRole, ROLE_READ, ROLE_WRITE, ROLE_ADMIN } from '~/lib/rbac'
import type { EnvRow, EnvVarRow, SecretRow } from '~/lib/types'

const forkSchema = z.object({
  name: z.string().min(1),
})

export const Route = createFileRoute('/api/projects/$projectId/envs/$envId/fork')({
  server: {
    handlers: {
      POST: async ({ request, params }) => {
        try {
          const { user } = await requireAuth(request)
          const orgId = await requireEnvRole(params, user.id, [ROLE_READ, ROLE_WRITE, ROLE_ADMIN])
          const projectId = params.projectId!
          const parentEnvId = params.envId!
          const { name } = forkSchema.parse(await request.json())

          const existing = await db.prepare(
            'SELECT id FROM environments WHERE project_id = ? AND name = ? AND deleted_at IS NULL'
          ).bind(projectId, name).first()
          if (existing) return Response.json({ error: 'Environment name already exists' }, { status: 409 })

          const newEnvId = generateId()
          await db.prepare(
            'INSERT INTO environments (id, project_id, name, parent_env_id, created_by) VALUES (?, ?, ?, ?, ?)'
          ).bind(newEnvId, projectId, name, parentEnvId, user.id).run()

          await db.prepare(
            'INSERT INTO env_permissions (env_id, user_id, role) VALUES (?, ?, ?)'
          ).bind(newEnvId, user.id, ROLE_ADMIN).run()

          const parentVars = await db.prepare(
            'SELECT key, value FROM env_vars WHERE env_id = ? AND deleted_at IS NULL'
          ).bind(parentEnvId).all<EnvVarRow>()
          for (const v of parentVars.results) {
            await db.prepare(
              'INSERT INTO env_vars (id, env_id, key, value, created_by) VALUES (?, ?, ?, ?, ?)'
            ).bind(generateId(), newEnvId, v.key, v.value, user.id).run()
          }

          const parentSecrets = await db.prepare(
            'SELECT key, encrypted_value FROM secrets WHERE env_id = ? AND deleted_at IS NULL'
          ).bind(parentEnvId).all<SecretRow>()
          for (const s of parentSecrets.results) {
            await db.prepare(
              'INSERT INTO secrets (id, env_id, key, encrypted_value, created_by) VALUES (?, ?, ?, ?, ?)'
            ).bind(generateId(), newEnvId, s.key, s.encrypted_value, user.id).run()
          }

          await auditLog({ orgId, actorUserId: user.id, action: 'env.fork', targetType: 'env', targetId: newEnvId, metadata: { parentEnvId } })

          const env = await db.prepare('SELECT * FROM environments WHERE id = ?').bind(newEnvId).first<EnvRow>()
          return Response.json(env, { status: 201 })
        } catch (err) {
          return errorResponse(err)
        }
      },
    },
  },
})
