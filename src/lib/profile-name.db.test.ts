// Integration test for PATCH /api/auth/me name validation, against the local
// dev Postgres (skipped when unreachable, like rbac.db.test.ts): display
// names are human-readable labels, so symbol-only junk ("*", "---") and names
// with line breaks are rejected; '' still clears the name (stored as null).
import { describe, it, expect, afterAll } from 'vitest'
import { inArray, sql } from 'drizzle-orm'
import { db } from './db'
import { users, sessions, auditLog } from './schema'
import { generateId } from './db-utils'
import { hashPassword, DEFAULT_KDF_PARAMS } from './crypto/kdf'
import { base64Encode } from './crypto/base64'
import { Route as meRoute } from '~/routes/api/auth/me'

const dbUp = await db.execute(sql`select 1`).then(() => true, () => false)

async function patchName(name: string, token: string): Promise<{ status: number; body: any }> {
  const request = new Request('http://localhost/api/auth/me', {
    method: 'PATCH',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
    body: JSON.stringify({ name }),
  })
  const resp: Response = await (meRoute as any).options.server.handlers.PATCH({ request } as any)
  return { status: resp.status, body: await resp.json() }
}

describe.runIf(dbUp)('PATCH /api/auth/me name validation (db)', () => {
  const userIds: string[] = []

  afterAll(async () => {
    await db.delete(auditLog).where(inArray(auditLog.actor_user_id, userIds))
    await db.delete(sessions).where(inArray(sessions.user_id, userIds))
    await db.delete(users).where(inArray(users.id, userIds))
  })

  it('rejects garbage names, accepts real ones, and clears on empty', async () => {
    const userId = generateId()
    userIds.push(userId)
    await db.insert(users).values({
      id: userId,
      email: `name-test-${userId}@test.invalid`,
      password_hash: await hashPassword('name-test-password'),
      kdf_salt: base64Encode(crypto.getRandomValues(new Uint8Array(16))),
      kdf_params: JSON.stringify(DEFAULT_KDF_PARAMS),
      // Presence satisfies the recovery gate; the phrase itself is never used.
      recovery_phrase_hash: 'test',
      email_verified_at: new Date(),
    })

    const tokenBytes = crypto.getRandomValues(new Uint8Array(32))
    const hashBuffer = await crypto.subtle.digest('SHA-256', tokenBytes as BufferSource)
    await db.insert(sessions).values({
      id: generateId(),
      user_id: userId,
      token_hash: base64Encode(new Uint8Array(hashBuffer)),
      kind: 'web',
      session_pubkey: 'x',
      encrypted_org_keys: '{}',
      expires_at: new Date(Date.now() + 60_000),
    })
    const token = base64Encode(tokenBytes)

    // The reported case: symbol-only names must not save.
    for (const garbage of ['*', '---', '🚀']) {
      expect((await patchName(garbage, token)).status).toBe(400)
    }

    const saved = await patchName('Ada Lovelace', token)
    expect(saved.status).toBe(200)
    expect(saved.body.name).toBe('Ada Lovelace')

    // Trimming applies before storing.
    expect((await patchName('  Ada  ', token)).body.name).toBe('Ada')

    // Empty clears the name to null.
    const cleared = await patchName('', token)
    expect(cleared.status).toBe(200)
    expect(cleared.body.name).toBeNull()
  }, 30_000)
})
