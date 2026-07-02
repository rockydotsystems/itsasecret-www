import { createFileRoute } from '@tanstack/react-router'
import { z } from 'zod'
import { db } from '~/lib/db'
import { generateId, auditLog } from '~/lib/db-utils'
import { requireAuth, errorResponse } from '~/lib/auth'
import { requireOrgRole, ORG_ROLE_OWNER, ORG_ROLE_ADMIN, ORG_ROLE_MEMBER } from '~/lib/rbac'
import type { OrgRow, OrgMemberRow } from '~/lib/types'

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
          const result = await db.prepare(
            `SELECT o.* FROM orgs o JOIN org_members m ON o.id = m.org_id WHERE m.user_id = ? AND o.deleted_at IS NULL`
          ).bind(user.id).all<OrgRow>()
          return Response.json(result.results, { status: 200 })
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
          await db.prepare(
            'INSERT INTO orgs (id, name, kind, owner_user_id) VALUES (?, ?, ?, ?)'
          ).bind(orgId, name, 'shared', user.id).run()

          await db.prepare(
            'INSERT INTO org_members (org_id, user_id, role, wrapped_org_key) VALUES (?, ?, ?, ?)'
          ).bind(orgId, user.id, ORG_ROLE_OWNER, wrappedOrgKey).run()

          const encryptedOrgKeys: Record<string, string> = JSON.parse(session.encrypted_org_keys)
          encryptedOrgKeys[orgId] = encryptedOrgKey
          await db.prepare('UPDATE sessions SET encrypted_org_keys = ? WHERE id = ?')
            .bind(JSON.stringify(encryptedOrgKeys), session.id).run()

          await auditLog({ orgId, actorUserId: user.id, action: 'org.create', targetType: 'org', targetId: orgId })

          const org = await db.prepare('SELECT * FROM orgs WHERE id = ?').bind(orgId).first<OrgRow>()
          return Response.json(org, { status: 201 })
        } catch (err) {
          return errorResponse(err)
        }
      },
    },
  },
})
