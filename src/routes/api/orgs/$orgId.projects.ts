import { createFileRoute } from '@tanstack/react-router'
import { z } from 'zod'
import { db } from '~/lib/db'
import { generateId, auditLog } from '~/lib/db-utils'
import { requireAuth, errorResponse } from '~/lib/auth'
import { requireOrgRole, ORG_ROLE_OWNER, ORG_ROLE_ADMIN, ORG_ROLE_MEMBER } from '~/lib/rbac'
import type { ProjectRow } from '~/lib/types'

const createProjectSchema = z.object({
  name: z.string().min(1),
})

export const Route = createFileRoute('/api/orgs/$orgId/projects')({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        try {
          const { user } = await requireAuth(request)
          await requireOrgRole(params, user.id, [ORG_ROLE_OWNER, ORG_ROLE_ADMIN, ORG_ROLE_MEMBER])
          const orgId = params.orgId!
          const result = await db.prepare(
            'SELECT * FROM projects WHERE org_id = ? AND deleted_at IS NULL'
          ).bind(orgId).all<ProjectRow>()
          return Response.json(result.results, { status: 200 })
        } catch (err) {
          return errorResponse(err)
        }
      },

      POST: async ({ request, params }) => {
        try {
          const { user } = await requireAuth(request)
          await requireOrgRole(params, user.id, [ORG_ROLE_OWNER, ORG_ROLE_ADMIN])
          const orgId = params.orgId!
          const { name } = createProjectSchema.parse(await request.json())

          const existing = await db.prepare(
            'SELECT id FROM projects WHERE org_id = ? AND name = ? AND deleted_at IS NULL'
          ).bind(orgId, name).first()
          if (existing) return Response.json({ error: 'Project name already exists' }, { status: 409 })

          const projectId = generateId()
          await db.prepare(
            'INSERT INTO projects (id, org_id, name) VALUES (?, ?, ?)'
          ).bind(projectId, orgId, name).run()

          await auditLog({ orgId, actorUserId: user.id, action: 'project.create', targetType: 'project', targetId: projectId })

          const project = await db.prepare('SELECT * FROM projects WHERE id = ?').bind(projectId).first<ProjectRow>()
          return Response.json(project, { status: 201 })
        } catch (err) {
          return errorResponse(err)
        }
      },
    },
  },
})
