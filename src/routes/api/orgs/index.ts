import { createFileRoute } from '@tanstack/react-router'
import { z } from 'zod'
import { eq, and, isNull } from 'drizzle-orm'
import { db } from '~/lib/db'
import { orgs, orgMembers, sessions } from '~/lib/schema'
import { generateId, auditLog, createProjectWithEnv } from '~/lib/db-utils'
import { requireAuth, errorResponse } from '~/lib/auth'
import { ORG_ROLE_OWNER } from '~/lib/rbac'

const createOrgSchema = z.object({
  name: z.string().min(1).max(100),
  wrappedOrgKey: z.string().max(10000),
  encryptedOrgKey: z.string().max(10000),
  // The "+ New org" wizard sets up the org's first project + environment in
  // the same request; both are optional so the endpoint can also create a
  // bare org.
  projectName: z.string().min(1).max(100).optional(),
  envName: z.string().min(1).max(100).optional(),
})

export const Route = createFileRoute('/api/orgs/')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          const { user } = await requireAuth(request)
          const rows = await db.select({
            id: orgs.id,
            name: orgs.name,
            kind: orgs.kind,
            owner_user_id: orgs.owner_user_id,
            created_at: orgs.created_at,
            deleted_at: orgs.deleted_at,
          }).from(orgs)
            .innerJoin(orgMembers, and(eq(orgMembers.org_id, orgs.id), eq(orgMembers.user_id, user.id)))
            .where(isNull(orgs.deleted_at))
          return Response.json(rows, { status: 200 })
        } catch (err) {
          return errorResponse(err)
        }
      },

      POST: async ({ request }) => {
        try {
          const { user, session } = await requireAuth(request)
          const body = createOrgSchema.parse(await request.json())
          const { name, wrappedOrgKey, encryptedOrgKey, projectName, envName } = body

          const orgId = generateId()
          const projectId = await db.transaction(async (tx) => {
            await tx.insert(orgs).values({
              id: orgId,
              name,
              kind: 'shared',
              owner_user_id: user.id,
            })

            await tx.insert(orgMembers).values({
              org_id: orgId,
              user_id: user.id,
              role: ORG_ROLE_OWNER,
              wrapped_org_key: wrappedOrgKey,
            })

            const pid = projectName
              ? await createProjectWithEnv(orgId, projectName, user.id, envName ?? 'production', tx)
              : null

            const encryptedOrgKeys: Record<string, string> = JSON.parse(session.encrypted_org_keys)
            encryptedOrgKeys[orgId] = encryptedOrgKey
            await tx.update(sessions)
              .set({ encrypted_org_keys: JSON.stringify(encryptedOrgKeys) })
              .where(eq(sessions.id, session.id))

            return pid
          })

          await auditLog({ orgId, actorUserId: user.id, action: 'org.create', targetType: 'org', targetId: orgId })
          if (projectId) {
            await auditLog({ orgId, actorUserId: user.id, action: 'project.create', targetType: 'project', targetId: projectId })
          }

          const orgRows = await db.select().from(orgs).where(eq(orgs.id, orgId)).limit(1)
          return Response.json({ org: orgRows[0], projectId }, { status: 201 })
        } catch (err) {
          return errorResponse(err)
        }
      },
    },
  },
})
