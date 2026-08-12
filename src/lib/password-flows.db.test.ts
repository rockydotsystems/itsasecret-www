// Integration test for the master-password invariant, against the local dev
// Postgres (skipped when no database is reachable, like rbac.db.test.ts):
//  - POST /api/auth/verify-password proves a typed password server-side - the
//    workspace wizard relies on this before wrapping a fresh org key, since a
//    password typed with a locked vault has no server-independent way to be
//    checked and a mistyped one permanently corrupts wrapped_org_key.
//  - POST /api/auth/change-password and POST /api/auth/login tolerate rows
//    already corrupted that way (skip + log) instead of failing the whole
//    operation with a 500.
import { describe, it, expect, afterAll } from 'vitest'
import { eq, and, inArray, or, sql } from 'drizzle-orm'
import { db } from './db'
import { users, orgs, orgMembers, sessions, auditLog } from './schema'
import { generateId } from './db-utils'
import { hashPassword, verifyPassword, deriveKey, DEFAULT_KDF_PARAMS } from './crypto/kdf'
import { wrapKey, unwrapKey, generateKey } from './crypto/envelope'
import { generateKeyPair } from './crypto/ecdh'
import { base64Encode, base64Decode } from './crypto/base64'
import { Route as verifyPasswordRoute } from '~/routes/api/auth/verify-password'
import { Route as changePasswordRoute } from '~/routes/api/auth/change-password'
import { Route as loginRoute } from '~/routes/api/auth/login'

const dbUp = await db.execute(sql`select 1`).then(() => true, () => false)

const OLD_PASSWORD = 'old-master-password-1'
const NEW_PASSWORD = 'new-master-password-1'
const WRONG_PASSWORD = 'typed-wrong-password'

interface TestUser {
  userId: string
  email: string
  salt: Uint8Array
  masterKey: Uint8Array
}

function post(route: unknown, body: unknown, token?: string): Promise<Response> {
  const headers: Record<string, string> = { 'content-type': 'application/json' }
  if (token) headers['authorization'] = `Bearer ${token}`
  const request = new Request('http://localhost/api/test', {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  })
  const handlers = (route as any).options.server.handlers
  return handlers.POST({ request } as any)
}

async function insertUser(password: string): Promise<TestUser> {
  const userId = generateId()
  const salt = crypto.getRandomValues(new Uint8Array(16))
  const masterKey = await deriveKey(password, salt, DEFAULT_KDF_PARAMS)
  await db.insert(users).values({
    id: userId,
    email: `pwflow-${userId}@test.invalid`,
    password_hash: await hashPassword(password),
    kdf_salt: base64Encode(salt),
    kdf_params: JSON.stringify(DEFAULT_KDF_PARAMS),
    email_verified_at: new Date(),
  })
  return { userId, email: `pwflow-${userId}@test.invalid`, salt, masterKey }
}

// Returns the raw bearer token that authenticates as this user.
async function insertSession(userId: string): Promise<string> {
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
  return base64Encode(tokenBytes)
}

// Simulates the org key being wrapped under a DIFFERENT (mistyped) password,
// as the unverified workspace-wizard fallback used to do.
async function insertOrgWithWrappedKey(userId: string, wrappedOrgKey: string): Promise<string> {
  const orgId = generateId()
  await db.insert(orgs).values({ id: orgId, name: `pwflow-${orgId}`, owner_user_id: userId })
  await db.insert(orgMembers).values({ org_id: orgId, user_id: userId, role: 'owner', wrapped_org_key: wrappedOrgKey })
  return orgId
}

describe.runIf(dbUp)('master password flows (db)', () => {
  const userIds: string[] = []
  const orgIds: string[] = []

  afterAll(async () => {
    await db.delete(auditLog).where(or(inArray(auditLog.actor_user_id, userIds), inArray(auditLog.org_id, orgIds)))
    await db.delete(sessions).where(inArray(sessions.user_id, userIds))
    await db.delete(orgMembers).where(inArray(orgMembers.org_id, orgIds))
    await db.delete(orgs).where(inArray(orgs.id, orgIds))
    await db.delete(users).where(inArray(users.id, userIds))
  })

  it('verify-password accepts the real master password and rejects any other', async () => {
    const u = await insertUser(OLD_PASSWORD)
    userIds.push(u.userId)
    const token = await insertSession(u.userId)

    const ok = await post(verifyPasswordRoute, { password: OLD_PASSWORD }, token)
    expect(ok.status).toBe(200)

    const bad = await post(verifyPasswordRoute, { password: WRONG_PASSWORD }, token)
    expect(bad.status).toBe(401)
  }, 30_000)

  it('change-password skips a corrupt wrapped_org_key instead of 500ing', async () => {
    const u = await insertUser(OLD_PASSWORD)
    userIds.push(u.userId)

    const goodOrgKey = generateKey()
    const goodWrapped = await wrapKey(u.masterKey, goodOrgKey)
    const goodOrgId = await insertOrgWithWrappedKey(u.userId, goodWrapped)

    const wrongMasterKey = await deriveKey(WRONG_PASSWORD, u.salt, DEFAULT_KDF_PARAMS)
    const corruptWrapped = await wrapKey(wrongMasterKey, generateKey())
    const corruptOrgId = await insertOrgWithWrappedKey(u.userId, corruptWrapped)
    orgIds.push(goodOrgId, corruptOrgId)

    const token = await insertSession(u.userId)
    const otherToken = await insertSession(u.userId)

    // Reproduces the production 500 scenario: without tolerance, unwrapKey
    // throws on the corrupt row and errorResponse maps it to a 500.
    const resp = await post(changePasswordRoute, { currentPassword: OLD_PASSWORD, newPassword: NEW_PASSWORD }, token)
    expect(resp.status).toBe(200)

    // Password hash and KDF salt were swapped to the new password.
    const [updated] = await db.select().from(users).where(eq(users.id, u.userId))
    expect(await verifyPassword(NEW_PASSWORD, updated.password_hash)).toBe(true)
    expect(updated.kdf_salt).not.toBe(base64Encode(u.salt))

    // The good org key got re-wrapped under the NEW master key, unchanged
    // plaintext.
    const [goodMember] = await db.select().from(orgMembers)
      .where(and(eq(orgMembers.org_id, goodOrgId), eq(orgMembers.user_id, u.userId)))
    const newMasterKey = await deriveKey(NEW_PASSWORD, base64Decode(updated.kdf_salt), DEFAULT_KDF_PARAMS)
    expect(Buffer.from(await unwrapKey(newMasterKey, goodMember.wrapped_org_key)).toString('hex'))
      .toBe(Buffer.from(goodOrgKey).toString('hex'))

    // The corrupt row is untouched (its plaintext is unrecoverable regardless).
    const [corruptMember] = await db.select().from(orgMembers)
      .where(and(eq(orgMembers.org_id, corruptOrgId), eq(orgMembers.user_id, u.userId)))
    expect(corruptMember.wrapped_org_key).toBe(corruptWrapped)

    // The current session survives; other web sessions are revoked.
    const rows = await db.select().from(sessions).where(eq(sessions.user_id, u.userId))
    expect(rows.length).toBe(2)
    const revokedCount = rows.filter((s) => s.revoked_at !== null).length
    expect(revokedCount).toBe(1)
    expect(otherToken).toBeTruthy()

    // Wrong current password is still refused.
    const denied = await post(changePasswordRoute, { currentPassword: OLD_PASSWORD, newPassword: 'x'.repeat(12) }, token)
    expect(denied.status).toBe(401)
  }, 30_000)

  it('login skips a corrupt wrapped_org_key instead of 500ing', async () => {
    const u = await insertUser(OLD_PASSWORD)
    userIds.push(u.userId)

    const goodOrgKey = generateKey()
    const goodWrapped = await wrapKey(u.masterKey, goodOrgKey)
    const goodOrgId = await insertOrgWithWrappedKey(u.userId, goodWrapped)

    const wrongMasterKey = await deriveKey(WRONG_PASSWORD, u.salt, DEFAULT_KDF_PARAMS)
    const corruptOrgId = await insertOrgWithWrappedKey(u.userId, await wrapKey(wrongMasterKey, generateKey()))
    orgIds.push(goodOrgId, corruptOrgId)

    const { publicKey: clientPubkey } = await generateKeyPair()
    const resp = await post(loginRoute, { email: u.email, password: OLD_PASSWORD, clientPubkey })
    expect(resp.status).toBe(200)
    const body = await resp.json()
    expect(Object.keys(body.orgKeys)).toEqual([goodOrgId])
    expect(body.masterWrappedOrgKeys[goodOrgId]).toBe(goodWrapped)
    expect(body.orgKeys[corruptOrgId]).toBeUndefined()
  }, 30_000)
})
