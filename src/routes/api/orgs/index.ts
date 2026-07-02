import { createFileRoute } from '@tanstack/react-router'
import { z } from 'zod'
import { eq, and, isNull } from 'drizzle-orm'
import { db } from '~/lib/db'
import { orgs, orgMembers, projects, sessions } from '~/lib/schema'
import { generateId, auditLog } from '~/lib/db-utils'
import { requireAuth, errorResponse } from '~/lib/auth'
import { ORG_ROLE_OWNER } from '~/lib/rbac'

const createOrgSchema = z.object({
  name: z.string().min(1),
  wrappedOrgKey: z.string(),
  encryptedOrgKey: z.string(),
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
          const { name, wrappedOrgKey, encryptedOrgKey } = body

          const orgId = generateId()
          await db.insert(orgs).values({
            id: orgId,
            name,
            kind: 'shared',
            owner_user_id: user.id,
          })

          await db.insert(orgMembers).values({
            org_id: orgId,
            user_id: user.id,
            role: ORG_ROLE_OWNER,
            wrapped_org_key: wrappedOrgKey,
          })

          const projectId = generateId()
          await db.insert(projects).values({
            id: projectId,
            org_id: orgId,
            name: 'default',
          })

          const encryptedOrgKeys: Record<string, string> = JSON.parse(session.encrypted_org_keys)
          encryptedOrgKeys[orgId] = encryptedOrgKey
          await db.update(sessions)
            .set({ encrypted_org_keys: JSON.stringify(encryptedOrgKeys) })
            .where(eq(sessions.id, session.id))

          await auditLog({ orgId, actorUserId: user.id, action: 'org.create', targetType: 'org', targetId: orgId })
          await auditLog({ orgId, actorUserId: user.id, action: 'project.create', targetType: 'project', targetId: projectId })

          const orgRows = await db.select().from(orgs).where(eq(orgs.id, orgId)).limit(1)
          return Response.json(orgRows[0], { status: 201 })
        } catch (err) {
          return errorResponse(err)
        }
      },
    },
  },
})
