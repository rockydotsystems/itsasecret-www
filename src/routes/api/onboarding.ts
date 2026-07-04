import { createFileRoute } from '@tanstack/react-router'
import { z } from 'zod'
import { eq, and, isNull } from 'drizzle-orm'
import { db } from '~/lib/db'
import { orgs, orgMembers, sessions } from '~/lib/schema'
import { generateId, auditLog, createProjectWithEnv } from '~/lib/db-utils'
import { requireAuth, errorResponse } from '~/lib/auth'
import { ORG_ROLE_OWNER } from '~/lib/rbac'

const onboardingSchema = z.object({
  orgName: z.string().min(1).max(100),
  projectName: z.string().min(1).max(100),
  envName: z.string().min(1).max(100),
  wrappedOrgKey: z.string(),
  encryptedOrgKey: z.string(),
})

export const Route = createFileRoute('/api/onboarding')({
  server: {
    handlers: {
      // One-shot first-workspace setup for a freshly verified account: creates
      // the personal org (key wrapped client-side under the master key), the
      // first project, and its first environment. Refused once the user
      // belongs to any live org — after that, the normal org/project APIs own
      // this.
      POST: async ({ request }) => {
        try {
          const { user, session } = await requireAuth(request)
          const body = onboardingSchema.parse(await request.json())
          const { orgName, projectName, envName, wrappedOrgKey, encryptedOrgKey } = body

          const memberRows = await db.select({ org_id: orgMembers.org_id }).from(orgMembers)
            .innerJoin(orgs, and(eq(orgs.id, orgMembers.org_id), isNull(orgs.deleted_at)))
            .where(eq(orgMembers.user_id, user.id))
            .limit(1)
          if (memberRows[0]) {
            return Response.json({ error: 'Account already has an organization' }, { status: 409 })
          }

          const orgId = generateId()
          await db.insert(orgs).values({
            id: orgId,
            name: orgName,
            kind: 'personal',
            owner_user_id: user.id,
          })

          await db.insert(orgMembers).values({
            org_id: orgId,
            user_id: user.id,
            role: ORG_ROLE_OWNER,
            wrapped_org_key: wrappedOrgKey,
          })

          const projectId = await createProjectWithEnv(orgId, projectName, user.id, envName)

          const encryptedOrgKeys: Record<string, string> = JSON.parse(session.encrypted_org_keys)
          encryptedOrgKeys[orgId] = encryptedOrgKey
          await db.update(sessions)
            .set({ encrypted_org_keys: JSON.stringify(encryptedOrgKeys) })
            .where(eq(sessions.id, session.id))

          await auditLog({ orgId, actorUserId: user.id, action: 'org.create', targetType: 'org', targetId: orgId })
          await auditLog({ orgId, actorUserId: user.id, action: 'project.create', targetType: 'project', targetId: projectId })

          return Response.json({ orgId, projectId }, { status: 201 })
        } catch (err) {
          return errorResponse(err)
        }
      },
    },
  },
})
