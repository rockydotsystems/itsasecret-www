import { createFileRoute } from '@tanstack/react-router'
import { db } from '~/lib/db'
import { requireAuth, getSessionKey, getOrgKey, errorResponse } from '~/lib/auth'
import { requireOrgRole, ORG_ROLE_OWNER, ORG_ROLE_ADMIN, ORG_ROLE_MEMBER } from '~/lib/rbac'
import { decrypt, encrypt } from '~/lib/crypto/envelope'
import type { EnvRow, EnvVarRow, SecretRow, ProjectRow, OrgMemberRow, EnvPermissionRow } from '~/lib/types'

export const Route = createFileRoute('/api/projects/$projectId/envs/$envName/pull')({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        try {
          const { user, session } = await requireAuth(request)
          const orgId = await requireOrgRole(params, user.id, [ORG_ROLE_OWNER, ORG_ROLE_ADMIN, ORG_ROLE_MEMBER])
          const projectId = params.projectId!
          const envName = params.envName!

          const project = await db.prepare('SELECT * FROM projects WHERE id = ? AND deleted_at IS NULL').bind(projectId).first<ProjectRow>()
          if (!project) return Response.json({ error: 'Project not found' }, { status: 404 })

          const env = await db.prepare(
            'SELECT * FROM environments WHERE project_id = ? AND name = ? AND deleted_at IS NULL'
          ).bind(projectId, envName).first<EnvRow>()
          if (!env) return Response.json({ error: 'Environment not found' }, { status: 404 })

          const member = await db.prepare(
            'SELECT * FROM org_members WHERE org_id = ? AND user_id = ?'
          ).bind(orgId, user.id).first<OrgMemberRow>()

          if (!member || (member.role !== ORG_ROLE_OWNER && member.role !== ORG_ROLE_ADMIN)) {
            const perm = await db.prepare(
              'SELECT * FROM env_permissions WHERE env_id = ? AND user_id = ?'
            ).bind(env.id, user.id).first<EnvPermissionRow>()
            if (!perm) return Response.json({ error: 'No access to this environment' }, { status: 403 })
          }

          const sessionKey = getSessionKey(request.headers.get('X-Session-Key'))
          const orgKey = await getOrgKey(session, sessionKey, orgId)

          const varResult = await db.prepare(
            'SELECT key, value FROM env_vars WHERE env_id = ? AND deleted_at IS NULL'
          ).bind(env.id).all<EnvVarRow>()

          const secretResult = await db.prepare(
            'SELECT key, encrypted_value FROM secrets WHERE env_id = ? AND deleted_at IS NULL'
          ).bind(env.id).all<SecretRow>()

          const secrets: Record<string, string> = {}
          for (const s of secretResult.results) {
            const plaintext = await decrypt(orgKey, s.encrypted_value)
            secrets[s.key] = await encrypt(sessionKey, plaintext)
          }

          return Response.json({
            vars: varResult.results.map((v) => ({ key: v.key, value: v.value })),
            secrets,
          }, { status: 200 })
        } catch (err) {
          return errorResponse(err)
        }
      },
    },
  },
})
