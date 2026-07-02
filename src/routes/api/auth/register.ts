import { createFileRoute } from '@tanstack/react-router'
import { z } from 'zod'
import { db } from '~/lib/db'
import { generateId, auditLog } from '~/lib/db-utils'
import { createSession } from '~/lib/sessions'
import { deriveKey, hashPassword, verifyPassword, DEFAULT_KDF_PARAMS } from '~/lib/crypto/kdf'
import type { KdfParams } from '~/lib/crypto/kdf'
import { generateKey, wrapKey, unwrapKey, encrypt } from '~/lib/crypto/envelope'
import { generateKeyPair, deriveSessionKey } from '~/lib/crypto/ecdh'
import { base64Encode, base64Decode } from '~/lib/crypto/base64'
import { requireAuth, errorResponse } from '~/lib/auth'
import { revokeSession } from '~/lib/sessions'
import type { UserRow, OrgMemberRow } from '~/lib/types'

const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(12),
  clientPubkey: z.string(),
})

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string(),
  clientPubkey: z.string(),
})

export const Route = createFileRoute('/api/auth/register')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const body = registerSchema.parse(await request.json())
          const { email, password, clientPubkey } = body

          const existing = await db.prepare('SELECT id FROM users WHERE email = ?').bind(email).first()
          if (existing) {
            return Response.json({ error: 'Email already registered' }, { status: 409 })
          }

          const salt = crypto.getRandomValues(new Uint8Array(16))
          const saltB64 = base64Encode(salt)

          const derivedKey = await deriveKey(password, salt)
          const passwordHash = await hashPassword(password, salt)

          const orgKey = generateKey()
          const wrappedOrgKey = await wrapKey(derivedKey, orgKey)

          const userId = generateId()
          await db.prepare(
            'INSERT INTO users (id, email, password_hash, kdf_salt, kdf_params) VALUES (?, ?, ?, ?, ?)'
          ).bind(userId, email, passwordHash, saltB64, JSON.stringify(DEFAULT_KDF_PARAMS)).run()

          const orgId = generateId()
          await db.prepare(
            'INSERT INTO orgs (id, name, kind, owner_user_id) VALUES (?, ?, ?, ?)'
          ).bind(orgId, `${email}'s org`, 'personal', userId).run()

          await db.prepare(
            'INSERT INTO org_members (org_id, user_id, role, wrapped_org_key) VALUES (?, ?, ?, ?)'
          ).bind(orgId, userId, 'owner', wrappedOrgKey).run()

          const { publicKey: serverPubkey, privateKey } = await generateKeyPair()
          const sessionKey = await deriveSessionKey(privateKey, clientPubkey)

          const encryptedOrgKey = await encrypt(sessionKey, base64Encode(orgKey))
          const orgKeys: Record<string, string> = { [orgId]: encryptedOrgKey }

          const { token } = await createSession(userId, serverPubkey, orgKeys)

          await auditLog({ actorUserId: userId, action: 'user.register', targetType: 'user', targetId: userId })
          await auditLog({ orgId, actorUserId: userId, action: 'org.create', targetType: 'org', targetId: orgId })

          return Response.json({ token, serverPubkey, orgKeys }, { status: 201 })
        } catch (err) {
          return errorResponse(err)
        }
      },
    },
  },
})
