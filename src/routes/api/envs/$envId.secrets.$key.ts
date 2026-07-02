import { createFileRoute } from '@tanstack/react-router'
import { z } from 'zod'
import { db } from '~/lib/db'
import { generateId, auditLog, softDelete } from '~/lib/db-utils'
import { requireAuth, getSessionKey, getOrgKey, errorResponse } from '~/lib/auth'
import { requireEnvRole, ROLE_READ, ROLE_WRITE, ROLE_ADMIN } from '~/lib/rbac'
import { encrypt, decrypt } from '~/lib/crypto/envelope'
import type { SecretRow } from '~/lib/types'

const upsertSchema = z.object({
  encryptedValue: z.string(),
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

          const secret = await db.prepare(
            'SELECT * FROM secrets WHERE env_id = ? AND key = ? AND deleted_at IS NULL'
          ).bind(envId, key).first<SecretRow>()
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
          const { encryptedValue } = upsertSchema.parse(await request.json())

          const sessionKey = getSessionKey(request.headers.get('X-Session-Key'))
          const orgKey = await getOrgKey(session, sessionKey, orgId)

          const plaintext = await decrypt(sessionKey, encryptedValue)
          const storedEncrypted = await encrypt(orgKey, plaintext)

          const existing = await db.prepare(
            'SELECT * FROM secrets WHERE env_id = ? AND key = ? AND deleted_at IS NULL'
          ).bind(envId, key).first<SecretRow>()

          if (existing) {
            await db.prepare(
              `UPDATE secrets SET encrypted_value = ?, updated_at = datetime('now') WHERE id = ?`
            ).bind(storedEncrypted, existing.id).run()
          } else {
            const deleted = await db.prepare(
              'SELECT id FROM secrets WHERE env_id = ? AND key = ? AND deleted_at IS NOT NULL'
            ).bind(envId, key).first<SecretRow>()

            if (deleted) {
              await db.prepare(
                `UPDATE secrets SET encrypted_value = ?, deleted_at = NULL, updated_at = datetime('now') WHERE id = ?`
              ).bind(storedEncrypted, deleted.id).run()
            } else {
              const secretId = generateId()
              await db.prepare(
                'INSERT INTO secrets (id, env_id, key, encrypted_value, created_by) VALUES (?, ?, ?, ?, ?)'
              ).bind(secretId, envId, key, storedEncrypted, user.id).run()
            }
          }

          await auditLog({ orgId, actorUserId: user.id, action: 'secret.upsert', targetType: 'secret', targetId: key, metadata: { envId } })

          const updated = await db.prepare(
            'SELECT key, created_at, updated_at FROM secrets WHERE env_id = ? AND key = ? AND deleted_at IS NULL'
          ).bind(envId, key).first<{ key: string; created_at: string; updated_at: string }>()
          return Response.json(updated, { status: 200 })
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

          const existing = await db.prepare(
            'SELECT id FROM secrets WHERE env_id = ? AND key = ? AND deleted_at IS NULL'
          ).bind(envId, key).first<SecretRow>()
          if (!existing) return Response.json({ error: 'Secret not found' }, { status: 404 })

          await softDelete('secrets', existing.id)
          await auditLog({ orgId, actorUserId: user.id, action: 'secret.delete', targetType: 'secret', targetId: key, metadata: { envId } })
          return new Response(null, { status: 204 })
        } catch (err) {
          return errorResponse(err)
        }
      },
    },
  },
})
