import { createFileRoute } from '@tanstack/react-router'
import { z } from 'zod'
import { eq } from 'drizzle-orm'
import { db } from '~/lib/db'
import { users, orgs, orgMembers } from '~/lib/schema'
import { generateId, auditLog } from '~/lib/db-utils'
import { createSession } from '~/lib/sessions'
import { deriveKey, hashPassword, DEFAULT_KDF_PARAMS } from '~/lib/crypto/kdf'
import { generateKey, wrapKey, encrypt } from '~/lib/crypto/envelope'
import { generateKeyPair, deriveSessionKey } from '~/lib/crypto/ecdh'
import { base64Encode } from '~/lib/crypto/base64'
import { errorResponse } from '~/lib/auth'

const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(12),
  clientPubkey: z.string(),
})

export const Route = createFileRoute('/api/auth/register')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const body = registerSchema.parse(await request.json())
          const { email, password, clientPubkey } = body

          const existingRows = await db.select({ id: users.id }).from(users).where(eq(users.email, email)).limit(1)
          if (existingRows[0]) {
            return Response.json({ error: 'Email already registered' }, { status: 409 })
          }

          const salt = crypto.getRandomValues(new Uint8Array(16))
          const saltB64 = base64Encode(salt)

          const derivedKey = await deriveKey(password, salt)
          const passwordHash = await hashPassword(password, salt)

          const orgKey = generateKey()
          const wrappedOrgKey = await wrapKey(derivedKey, orgKey)

          const userId = generateId()
          await db.insert(users).values({
            id: userId,
            email,
            password_hash: passwordHash,
            kdf_salt: saltB64,
            kdf_params: JSON.stringify(DEFAULT_KDF_PARAMS),
          })

          const orgId = generateId()
          await db.insert(orgs).values({
            id: orgId,
            name: `${email}'s org`,
            kind: 'personal',
            owner_user_id: userId,
          })

          await db.insert(orgMembers).values({
            org_id: orgId,
            user_id: userId,
            role: 'owner',
            wrapped_org_key: wrappedOrgKey,
          })

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
