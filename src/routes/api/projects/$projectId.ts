import { createFileRoute } from '@tanstack/react-router'
import { z } from 'zod'
import { db } from '~/lib/db'
import { auditLog, softDelete } from '~/lib/db-utils'
import { requireAuth, errorResponse } from '~/lib/auth'
import { requireOrgRole, ORG_ROLE_OWNER, ORG_ROLE_ADMIN, ORG_ROLE_MEMBER } from '~/lib/rbac'
import type { ProjectRow } from '~/lib/types'

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
          const project = await db.prepare('SELECT * FROM projects WHERE id = ? AND deleted_at IS NULL').bind(projectId).first<ProjectRow>()
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

          const project = await db.prepare('SELECT * FROM projects WHERE id = ? AND deleted_at IS NULL').bind(projectId).first<ProjectRow>()
          if (!project) return Response.json({ error: 'Project not found' }, { status: 404 })

          if (name) {
            await db.prepare('UPDATE projects SET name = ? WHERE id = ?').bind(name, projectId).run()
          }

          await auditLog({ orgId, actorUserId: user.id, action: 'project.update', targetType: 'project', targetId: projectId })

          const updated = await db.prepare('SELECT * FROM projects WHERE id = ?').bind(projectId).first<ProjectRow>()
          return Response.json(updated, { status: 200 })
        } catch (err) {
          return errorResponse(err)
        }
      },

      DELETE: async ({ request, params }) => {
        try {
          const { user } = await requireAuth(request)
          const orgId = await requireOrgRole(params, user.id, [ORG_ROLE_OWNER, ORG_ROLE_ADMIN])
          const projectId = params.projectId!
          await softDelete('projects', projectId)
          await auditLog({ orgId, actorUserId: user.id, action: 'project.delete', targetType: 'project', targetId: projectId })
          return new Response(null, { status: 204 })
        } catch (err) {
          return errorResponse(err)
        }
      },
    },
  },
})
