import { createFileRoute } from '@tanstack/react-router'
import { eq, and, isNull } from 'drizzle-orm'
import { db } from '~/lib/db'
import { projects, environments, envVars, secrets } from '~/lib/schema'
import { auditLog } from '~/lib/db-utils'
import { requireAuth, getSessionKey, getOrgKey, errorResponse, HttpError } from '~/lib/auth'
import { requireEnvRole, ROLE_READ, ROLE_WRITE, ROLE_ADMIN } from '~/lib/rbac'
import { decrypt, encrypt } from '~/lib/crypto/envelope'
import { isRateLimited, recordFailedAttempt } from '~/lib/rate-limit'

export const Route = createFileRoute('/api/projects/$projectId/envs/$envName/pull')({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        try {
          const { user, session } = await requireAuth(request)
          const projectId = params.projectId!
          const envName = params.envName!

          const projectRows = await db.select().from(projects)
            .where(and(eq(projects.id, projectId), isNull(projects.deleted_at)))
            .limit(1)
          const project = projectRows[0] ?? null
          const envRows = await db.select().from(environments)
            .where(and(eq(environments.project_id, projectId), eq(environments.name, envName), isNull(environments.deleted_at)))
            .limit(1)
          const env = envRows[0] ?? null

          // Existence and access failures are indistinguishable to
          // non-members: one generic 404 that never confirms an object.
          if (!project || !env) return Response.json({ error: 'Not found' }, { status: 404 })

          const envParams: Record<string, string | undefined> = { envId: env.id }
          let orgId: string
          try {
            orgId = await requireEnvRole(envParams, user.id, [ROLE_READ, ROLE_WRITE, ROLE_ADMIN])
          } catch (err) {
            if (err instanceof HttpError && err.status === 403) {
              return Response.json({ error: 'Not found' }, { status: 404 })
            }
            throw err
          }

          const pullKey = `pull:${user.id}`
          const pullLimit = isRateLimited(pullKey)
          if (pullLimit.limited) {
            return Response.json(
              { error: 'Too many pull requests. Please try again later.' },
              { status: 429, headers: { 'Retry-After': String(pullLimit.retryAfterSeconds) } }
            )
          }
          recordFailedAttempt(pullKey)

          const sessionKey = getSessionKey(request.headers.get('X-Session-Key'))
          const orgKey = await getOrgKey(session, sessionKey, orgId)

          const varRows = await db.select({
            key: envVars.key,
            value: envVars.value,
          }).from(envVars)
            .where(and(eq(envVars.env_id, env.id), isNull(envVars.deleted_at)))

          const secretRows = await db.select({
            key: secrets.key,
            encrypted_value: secrets.encrypted_value,
          }).from(secrets)
            .where(and(eq(secrets.env_id, env.id), isNull(secrets.deleted_at)))

          // Null prototype: a '__proto__' key must not hit the setter.
          const secretsMap: Record<string, string> = Object.create(null)
          const failed: string[] = []
          for (const s of secretRows) {
            // One corrupt blob must not fail the whole env pull.
            try {
              const plaintext = await decrypt(orgKey, s.encrypted_value)
              secretsMap[s.key] = await encrypt(sessionKey, plaintext)
            } catch {
              failed.push(s.key)
            }
          }

          await auditLog({ orgId, actorUserId: user.id, action: 'env.pull', targetType: 'env', targetId: env.id, metadata: { envId: env.id, vars: varRows.length, secrets: secretRows.length, failed: failed.length } })

          return Response.json({
            vars: varRows.map((v) => ({ key: v.key, value: v.value })),
            secrets: secretsMap,
            failed,
          }, { status: 200 })
        } catch (err) {
          return errorResponse(err)
        }
      },
    },
  },
})
