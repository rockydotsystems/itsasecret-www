import { createFileRoute } from '@tanstack/react-router'
import { z } from 'zod'
import { eq, and, isNull } from 'drizzle-orm'
import { db } from '~/lib/db'
import { environments, envPermissions, envVars, secrets } from '~/lib/schema'
import { generateId, auditLog } from '~/lib/db-utils'
import { requireAuth, errorResponse } from '~/lib/auth'
import { requireEnvRole, ROLE_READ, ROLE_WRITE, ROLE_ADMIN } from '~/lib/rbac'

const forkSchema = z.object({
  name: z.string().min(1).max(100),
})

export const Route = createFileRoute('/api/projects/$projectId/envs/$envId/fork')({
  server: {
    handlers: {
      POST: async ({ request, params }) => {
        try {
          const { user } = await requireAuth(request)
          const orgId = await requireEnvRole(params, user.id, [ROLE_READ, ROLE_WRITE, ROLE_ADMIN])
          const projectId = params.projectId!
          const parentEnvId = params.envId!
          const { name } = forkSchema.parse(await request.json())

          // requireEnvRole authorizes against the env's *own* project/org. The
          // fork is written into params.projectId, which is a separate URL
          // segment - without this check a reader of env E could fork it into
          // any project in any other org (cross-tenant write). Pin the two
          // together: the env must actually live in the project being forked into.
          const parentRows = await db.select({ project_id: environments.project_id }).from(environments)
            .where(and(eq(environments.id, parentEnvId), isNull(environments.deleted_at)))
            .limit(1)
          const parentEnv = parentRows[0] ?? null
          if (!parentEnv || parentEnv.project_id !== projectId) {
            return Response.json({ error: 'Environment not found' }, { status: 404 })
          }

          const existingRows = await db.select({ id: environments.id }).from(environments)
            .where(and(eq(environments.project_id, projectId), eq(environments.name, name), isNull(environments.deleted_at)))
            .limit(1)
          if (existingRows[0]) return Response.json({ error: 'Environment name already exists' }, { status: 409 })

          const newEnvId = generateId()
          await db.transaction(async (tx) => {
            await tx.insert(environments).values({
              id: newEnvId,
              project_id: projectId,
              name,
              parent_env_id: parentEnvId,
              created_by: user.id,
            })

            await tx.insert(envPermissions).values({
              env_id: newEnvId,
              user_id: user.id,
              role: ROLE_ADMIN,
            })

            const parentVars = await tx.select({
              key: envVars.key,
              value: envVars.value,
            }).from(envVars)
              .where(and(eq(envVars.env_id, parentEnvId), isNull(envVars.deleted_at)))
            for (const v of parentVars) {
              await tx.insert(envVars).values({
                id: generateId(),
                env_id: newEnvId,
                key: v.key,
                value: v.value,
                created_by: user.id,
              })
            }

            const parentSecrets = await tx.select({
              key: secrets.key,
              encrypted_value: secrets.encrypted_value,
            }).from(secrets)
              .where(and(eq(secrets.env_id, parentEnvId), isNull(secrets.deleted_at)))
            for (const s of parentSecrets) {
              await tx.insert(secrets).values({
                id: generateId(),
                env_id: newEnvId,
                key: s.key,
                encrypted_value: s.encrypted_value,
                created_by: user.id,
              })
            }
          })

          await auditLog({ orgId, actorUserId: user.id, action: 'env.fork', targetType: 'env', targetId: newEnvId, metadata: { parentEnvId } })

          const envRows = await db.select().from(environments).where(eq(environments.id, newEnvId)).limit(1)
          return Response.json(envRows[0], { status: 201 })
        } catch (err) {
          return errorResponse(err)
        }
      },
    },
  },
})
