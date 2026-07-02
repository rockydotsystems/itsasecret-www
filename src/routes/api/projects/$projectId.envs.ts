import { createFileRoute } from '@tanstack/react-router'
import { z } from 'zod'
import { db } from '~/lib/db'
import { generateId, auditLog } from '~/lib/db-utils'
import { requireAuth, errorResponse } from '~/lib/auth'
import { requireOrgRole, ORG_ROLE_OWNER, ORG_ROLE_ADMIN, ORG_ROLE_MEMBER } from '~/lib/rbac'
import type { EnvRow } from '~/lib/types'

const createEnvSchema = z.object({
  name: z.string().min(1),
})

export const Route = createFileRoute('/api/projects/$projectId/envs')({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        try {
          const { user } = await requireAuth(request)
          await requireOrgRole(params, user.id, [ORG_ROLE_OWNER, ORG_ROLE_ADMIN, ORG_ROLE_MEMBER])
          const projectId = params.projectId!
          const result = await db.prepare(
            'SELECT * FROM environments WHERE project_id = ? AND deleted_at IS NULL'
          ).bind(projectId).all<EnvRow>()
          return Response.json(result.results, { status: 200 })
        } catch (err) {
          return errorResponse(err)
        }
      },

      POST: async ({ request, params }) => {
        try {
          const { user } = await requireAuth(request)
          const orgId = await requireOrgRole(params, user.id, [ORG_ROLE_OWNER, ORG_ROLE_ADMIN])
          const projectId = params.projectId!
          const { name } = createEnvSchema.parse(await request.json())

          const existing = await db.prepare(
            'SELECT id FROM environments WHERE project_id = ? AND name = ? AND deleted_at IS NULL'
          ).bind(projectId, name).first()
          if (existing) return Response.json({ error: 'Environment name already exists' }, { status: 409 })

          const envId = generateId()
          await db.prepare(
            'INSERT INTO environments (id, project_id, name, created_by) VALUES (?, ?, ?, ?)'
          ).bind(envId, projectId, name, user.id).run()

          await auditLog({ orgId, actorUserId: user.id, action: 'env.create', targetType: 'env', targetId: envId })

          const env = await db.prepare('SELECT * FROM environments WHERE id = ?').bind(envId).first<EnvRow>()
          return Response.json(env, { status: 201 })
        } catch (err) {
          return errorResponse(err)
        }
      },
    },
  },
})
