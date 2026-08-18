import { createFileRoute } from '@tanstack/react-router'
import { z } from 'zod'
import { eq, and, isNull, sql } from 'drizzle-orm'
import { db } from '~/lib/db'
import { projects } from '~/lib/schema'
import { auditLog, createProjectWithEnv } from '~/lib/db-utils'
import { requireAuth, errorResponse, HttpError } from '~/lib/auth'
import { requireOrgRole, ORG_ROLE_OWNER, ORG_ROLE_ADMIN, ORG_ROLE_MEMBER } from '~/lib/rbac'
import { assertProjectCapacity } from '~/lib/plans'
import { displayName } from '~/lib/validation'

const createProjectSchema = z.object({
  name: displayName(),
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

          // One transaction under a per-org advisory lock so the count-check
          // and the create are serialized: concurrent creates cannot slip
          // past the plan cap between count and insert.
          const projectId = await db.transaction(async (tx) => {
            await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${orgId}))`)
            const existingRows = await tx.select({ id: projects.id }).from(projects)
              .where(and(eq(projects.org_id, orgId), eq(projects.name, name), isNull(projects.deleted_at)))
              .limit(1)
            if (existingRows[0]) throw new HttpError(409, { error: 'Project name already exists' })
            await assertProjectCapacity(orgId)
            return createProjectWithEnv(orgId, name, user.id, undefined, tx)
          })

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
