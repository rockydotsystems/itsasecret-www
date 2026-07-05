import { createFileRoute } from '@tanstack/react-router'
import { z } from 'zod'
import { eq, and, isNull, isNotNull } from 'drizzle-orm'
import { db } from '~/lib/db'
import { secrets } from '~/lib/schema'
import { generateId, auditLog, softDeleteSecret } from '~/lib/db-utils'
import { requireAuth, getSessionKey, getOrgKey, errorResponse } from '~/lib/auth'
import { requireEnvRole, ROLE_READ, ROLE_WRITE, ROLE_ADMIN } from '~/lib/rbac'
import { encrypt, decrypt } from '~/lib/crypto/envelope'
import { recordSecretHistory } from '~/lib/history'

// cipher 'session': value is encrypted under the ECDH transport key and the
// server re-encrypts it under the org key (CLI flow). cipher 'org': value is
// already encrypted under the org key in the client and is stored verbatim -
// the server never sees the plaintext (web E2E flow).
const upsertSchema = z.object({
  encryptedValue: z.string(),
  cipher: z.enum(['session', 'org']).optional().default('session'),
})

export const Route = createFileRoute('/api/envs/$envId/secrets/$key')({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        try {
          const { user, session } = await requireAuth(request)
          const orgId = await requireEnvRole(params, user.id, [ROLE_READ, ROLE_WRITE, ROLE_ADMIN])
          const envId = params.envId!
          const key = params.key!

          const secretRows = await db.select().from(secrets)
            .where(and(eq(secrets.env_id, envId), eq(secrets.key, key), isNull(secrets.deleted_at)))
            .limit(1)
          const secret = secretRows[0] ?? null
          if (!secret) return Response.json({ error: 'Secret not found' }, { status: 404 })

          const sessionKey = getSessionKey(request.headers.get('X-Session-Key'))
          const orgKey = await getOrgKey(session, sessionKey, orgId)

          const plaintext = await decrypt(orgKey, secret.encrypted_value)
          const transportEncrypted = await encrypt(sessionKey, plaintext)

          await auditLog({ orgId, actorUserId: user.id, action: 'secret.reveal', targetType: 'secret', targetId: key, metadata: { envId } })

          return Response.json({ key, encryptedValue: transportEncrypted }, { status: 200 })
        } catch (err) {
          return errorResponse(err)
        }
      },

      PUT: async ({ request, params }) => {
        try {
          const { user, session } = await requireAuth(request)
          const orgId = await requireEnvRole(params, user.id, [ROLE_WRITE, ROLE_ADMIN])
          const envId = params.envId!
          const key = params.key!
          const { encryptedValue, cipher } = upsertSchema.parse(await request.json())

          let storedEncrypted: string
          if (cipher === 'org') {
            storedEncrypted = encryptedValue
          } else {
            const sessionKey = getSessionKey(request.headers.get('X-Session-Key'))
            const orgKey = await getOrgKey(session, sessionKey, orgId)
            const plaintext = await decrypt(sessionKey, encryptedValue)
            storedEncrypted = await encrypt(orgKey, plaintext)
          }

          const existingRows = await db.select().from(secrets)
            .where(and(eq(secrets.env_id, envId), eq(secrets.key, key), isNull(secrets.deleted_at)))
            .limit(1)
          const existing = existingRows[0] ?? null

          if (existing) {
            await recordSecretHistory({
              secretId: existing.id,
              envId,
              key,
              encryptedValue: existing.encrypted_value,
              changeType: 'update',
              changedBy: user.id,
            })
            await db.update(secrets)
              .set({ encrypted_value: storedEncrypted, updated_at: new Date() })
              .where(eq(secrets.id, existing.id))
          } else {
            const deletedRows = await db.select({ id: secrets.id }).from(secrets)
              .where(and(eq(secrets.env_id, envId), eq(secrets.key, key), isNotNull(secrets.deleted_at)))
              .limit(1)
            const deleted = deletedRows[0] ?? null

            if (deleted) {
              await db.update(secrets)
                .set({ encrypted_value: storedEncrypted, deleted_at: null, hidden_at: null, updated_at: new Date() })
                .where(eq(secrets.id, deleted.id))
            } else {
              const secretId = generateId()
              await db.insert(secrets).values({
                id: secretId,
                env_id: envId,
                key,
                encrypted_value: storedEncrypted,
                created_by: user.id,
              })
            }
          }

          await auditLog({ orgId, actorUserId: user.id, action: 'secret.upsert', targetType: 'secret', targetId: key, metadata: { envId } })

          const updatedRows = await db.select({
            key: secrets.key,
            created_at: secrets.created_at,
            updated_at: secrets.updated_at,
          }).from(secrets)
            .where(and(eq(secrets.env_id, envId), eq(secrets.key, key), isNull(secrets.deleted_at)))
            .limit(1)
          return Response.json(updatedRows[0], { status: 200 })
        } catch (err) {
          return errorResponse(err)
        }
      },

      DELETE: async ({ request, params }) => {
        try {
          const { user } = await requireAuth(request)
          const orgId = await requireEnvRole(params, user.id, [ROLE_WRITE, ROLE_ADMIN])
          const envId = params.envId!
          const key = params.key!

          const existingRows = await db.select().from(secrets)
            .where(and(eq(secrets.env_id, envId), eq(secrets.key, key), isNull(secrets.deleted_at)))
            .limit(1)
          const existing = existingRows[0] ?? null
          if (!existing) return Response.json({ error: 'Secret not found' }, { status: 404 })

          await recordSecretHistory({
            secretId: existing.id,
            envId,
            key,
            encryptedValue: existing.encrypted_value,
            changeType: 'delete',
            changedBy: user.id,
          })
          await softDeleteSecret(existing.id)
          await auditLog({ orgId, actorUserId: user.id, action: 'secret.delete', targetType: 'secret', targetId: key, metadata: { envId } })
          return new Response(null, { status: 204 })
        } catch (err) {
          return errorResponse(err)
        }
      },
    },
  },
})
