import { createFileRoute } from '@tanstack/react-router'
import { z } from 'zod'
import { eq, and, isNull } from 'drizzle-orm'
import { db } from '~/lib/db'
import { projects } from '~/lib/schema'
import { auditLog, createProjectWithEnv } from '~/lib/db-utils'
import { requireAuth, errorResponse } from '~/lib/auth'
import { requireOrgRole, ORG_ROLE_OWNER, ORG_ROLE_ADMIN, ORG_ROLE_MEMBER } from '~/lib/rbac'

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
          const rows = await db.select().from(projects)
            .where(and(eq(projects.org_id, orgId), isNull(projects.deleted_at)))
          return Response.json(rows, { status: 200 })
        } catch (err) {
          return errorResponse(err)
        }
      },

      POST: async ({ request, params }) => {
        try {
          const { user } = await requireAuth(request)
          const orgId = await requireOrgRole(params, user.id, [ORG_ROLE_OWNER, ORG_ROLE_ADMIN])
          const { name } = createProjectSchema.parse(await request.json())

          const existingRows = await db.select({ id: projects.id }).from(projects)
            .where(and(eq(projects.org_id, orgId), eq(projects.name, name), isNull(projects.deleted_at)))
            .limit(1)
          if (existingRows[0]) return Response.json({ error: 'Project name already exists' }, { status: 409 })

          const projectId = await createProjectWithEnv(orgId, name, user.id)

          await auditLog({ orgId, actorUserId: user.id, action: 'project.create', targetType: 'project', targetId: projectId })

          const projectRows = await db.select().from(projects).where(eq(projects.id, projectId)).limit(1)
          return Response.json(projectRows[0], { status: 201 })
        } catch (err) {
          return errorResponse(err)
        }
      },
    },
  },
})
