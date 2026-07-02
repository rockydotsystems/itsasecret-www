import { createFileRoute } from '@tanstack/react-router'
import { z } from 'zod'
import { eq, and, isNull } from 'drizzle-orm'
import { db } from '~/lib/db'
import { projects } from '~/lib/schema'
import { auditLog, softDeleteProject } from '~/lib/db-utils'
import { requireAuth, errorResponse } from '~/lib/auth'
import { requireOrgRole, ORG_ROLE_OWNER, ORG_ROLE_ADMIN, ORG_ROLE_MEMBER } from '~/lib/rbac'

const updateSchema = z.object({
  name: z.string().min(1).optional(),
})

export const Route = createFileRoute('/api/projects/$projectId')({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        try {
          const { user } = await requireAuth(request)
          await requireOrgRole(params, user.id, [ORG_ROLE_OWNER, ORG_ROLE_ADMIN, ORG_ROLE_MEMBER])
          const projectId = params.projectId!
          const rows = await db.select().from(projects)
            .where(and(eq(projects.id, projectId), isNull(projects.deleted_at)))
            .limit(1)
          const project = rows[0] ?? null
          if (!project) return Response.json({ error: 'Project not found' }, { status: 404 })
          return Response.json(project, { status: 200 })
        } catch (err) {
          return errorResponse(err)
        }
      },

      PATCH: async ({ request, params }) => {
        try {
          const { user } = await requireAuth(request)
          const orgId = await requireOrgRole(params, user.id, [ORG_ROLE_OWNER, ORG_ROLE_ADMIN])
          const projectId = params.projectId!
          const { name } = updateSchema.parse(await request.json())

          const rows = await db.select().from(projects)
            .where(and(eq(projects.id, projectId), isNull(projects.deleted_at)))
            .limit(1)
          const project = rows[0] ?? null
          if (!project) return Response.json({ error: 'Project not found' }, { status: 404 })

          if (name) {
            await db.update(projects).set({ name }).where(eq(projects.id, projectId))
          }

          await auditLog({ orgId, actorUserId: user.id, action: 'project.update', targetType: 'project', targetId: projectId })

          const updatedRows = await db.select().from(projects).where(eq(projects.id, projectId)).limit(1)
          return Response.json(updatedRows[0], { status: 200 })
        } catch (err) {
          return errorResponse(err)
        }
      },

      DELETE: async ({ request, params }) => {
        try {
          const { user } = await requireAuth(request)
          const orgId = await requireOrgRole(params, user.id, [ORG_ROLE_OWNER, ORG_ROLE_ADMIN])
          const projectId = params.projectId!
          await softDeleteProject(projectId)
          await auditLog({ orgId, actorUserId: user.id, action: 'project.delete', targetType: 'project', targetId: projectId })
          return new Response(null, { status: 204 })
        } catch (err) {
          return errorResponse(err)
        }
      },
    },
  },
})
