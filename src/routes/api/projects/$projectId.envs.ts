import { createFileRoute } from '@tanstack/react-router'
import { z } from 'zod'
import { eq, and, isNull } from 'drizzle-orm'
import { db } from '~/lib/db'
import { environments } from '~/lib/schema'
import { generateId, auditLog } from '~/lib/db-utils'
import { requireAuth, errorResponse } from '~/lib/auth'
import { requireOrgRole, ORG_ROLE_OWNER, ORG_ROLE_ADMIN, ORG_ROLE_MEMBER } from '~/lib/rbac'

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
          const rows = await db.select().from(environments)
            .where(and(eq(environments.project_id, projectId), isNull(environments.deleted_at)))
          return Response.json(rows, { status: 200 })
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

          const existingRows = await db.select({ id: environments.id }).from(environments)
            .where(and(eq(environments.project_id, projectId), eq(environments.name, name), isNull(environments.deleted_at)))
            .limit(1)
          if (existingRows[0]) return Response.json({ error: 'Environment name already exists' }, { status: 409 })

          const envId = generateId()
          await db.insert(environments).values({
            id: envId,
            project_id: projectId,
            name,
            created_by: user.id,
          })

          await auditLog({ orgId, actorUserId: user.id, action: 'env.create', targetType: 'env', targetId: envId })

          const envRows = await db.select().from(environments).where(eq(environments.id, envId)).limit(1)
          return Response.json(envRows[0], { status: 201 })
        } catch (err) {
          return errorResponse(err)
        }
      },
    },
  },
})
