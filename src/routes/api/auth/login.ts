import { createFileRoute } from '@tanstack/react-router'
import { z } from 'zod'
import { eq } from 'drizzle-orm'
import { db } from '~/lib/db'
import { users, orgMembers } from '~/lib/schema'
import type { User } from '~/lib/schema'
import { auditLog } from '~/lib/db-utils'
import { createSession } from '~/lib/sessions'
import { deriveKey, verifyPassword } from '~/lib/crypto/kdf'
import type { KdfParams } from '~/lib/crypto/kdf'
import { unwrapKey, encrypt } from '~/lib/crypto/envelope'
import { generateKeyPair, deriveSessionKey } from '~/lib/crypto/ecdh'
import { base64Decode, base64Encode } from '~/lib/crypto/base64'
import { errorResponse } from '~/lib/auth'

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string(),
  clientPubkey: z.string(),
})

export const Route = createFileRoute('/api/auth/login')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const body = loginSchema.parse(await request.json())
          const { email, password, clientPubkey } = body

          const userRows = await db.select().from(users).where(eq(users.email, email)).limit(1)
          const user = userRows[0] ?? null
          if (!user) {
            return Response.json({ error: 'Invalid credentials' }, { status: 401 })
          }

          const valid = await verifyPassword(password, user.password_hash)
          if (!valid) {
            return Response.json({ error: 'Invalid credentials' }, { status: 401 })
          }

          const salt = base64Decode(user.kdf_salt)
          const params: KdfParams = JSON.parse(user.kdf_params)
          const derivedKey = await deriveKey(password, salt, params)

          const memberRows = await db.select().from(orgMembers).where(eq(orgMembers.user_id, user.id))

          const { publicKey: serverPubkey, privateKey } = await generateKeyPair()
          const sessionKey = await deriveSessionKey(privateKey, clientPubkey)

          const orgKeys: Record<string, string> = {}
          for (const member of memberRows) {
            const orgKey = await unwrapKey(derivedKey, member.wrapped_org_key)
            orgKeys[member.org_id] = await encrypt(sessionKey, base64Encode(orgKey))
          }

          const { token } = await createSession(user.id, serverPubkey, orgKeys)

          await auditLog({ actorUserId: user.id, action: 'user.login' })

          return Response.json({ token, serverPubkey, orgKeys }, { status: 200 })
        } catch (err) {
          return errorResponse(err)
        }
      },
    },
  },
})
