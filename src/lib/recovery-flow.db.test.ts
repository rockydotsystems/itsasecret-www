// Integration test for the recovery-phrase device-trust flow, against the
// local dev Postgres (skipped when no database is reachable):
//  - register returns a phrase and hashes it,
//  - login from an unenrolled device 403s with RECOVERY_REQUIRED,
//  - verify-recovery enrolls the device and issues a token,
//  - login with that token succeeds,
//  - rotating the phrase burns the old one immediately,
//  - legacy accounts (no phrase) log in without the device gate.
import { describe, it, expect, afterAll } from 'vitest'
import { eq, and, inArray, sql } from 'drizzle-orm'
import { db } from './db'
import { users, sessions, auditLog, deviceTokens, emailVerifications } from './schema'
import { generateId } from './db-utils'
import { hashPassword, DEFAULT_KDF_PARAMS } from './crypto/kdf'
import { base64Encode } from './crypto/base64'
import { generateRecoveryPhrase } from './recovery-phrase'
import { hashToken } from './device-tokens'
import { generateKeyPair } from './crypto/ecdh'
import { Route as registerRoute } from '~/routes/api/auth/register'
import { Route as loginRoute } from '~/routes/api/auth/login'
import { Route as verifyRecoveryRoute } from '~/routes/api/auth/verify-recovery'
import { Route as regenerateRoute } from '~/routes/api/auth/regenerate-recovery'

const dbUp = await db.execute(sql`select 1`).then(() => true, () => false)

const PASSWORD = 'test-master-password-1'

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

// The login route derives a session key via ECDH, so clients must present a
// real P-256 public key. Device pubkeys only need to be random labels.
async function realClientPubkey(): Promise<string> {
  const { publicKey } = await generateKeyPair()
  return publicKey
}
function fakeDevicePubkey(): string {
  return base64Encode(crypto.getRandomValues(new Uint8Array(65)))
}

async function insertLegacyUser(): Promise<{ userId: string; email: string }> {
  const userId = generateId()
  const email = `legacy-${userId}@test.invalid`
  await db.insert(users).values({
    id: userId,
    email,
    password_hash: await hashPassword(PASSWORD),
    kdf_salt: base64Encode(crypto.getRandomValues(new Uint8Array(16))),
    kdf_params: JSON.stringify(DEFAULT_KDF_PARAMS),
    email_verified_at: new Date(),
    // No recovery_phrase_hash: this is the pre-phrases shape.
  })
  return { userId, email }
}

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

describe.runIf(dbUp)('recovery phrase device-trust flow (db)', () => {
  const userIds: string[] = []

  afterAll(async () => {
    await db.delete(auditLog).where(inArray(auditLog.actor_user_id, userIds))
    await db.delete(deviceTokens).where(inArray(deviceTokens.user_id, userIds))
    await db.delete(emailVerifications).where(inArray(emailVerifications.user_id, userIds))
    await db.delete(sessions).where(inArray(sessions.user_id, userIds))
    await db.delete(users).where(inArray(users.id, userIds))
  })

  it('register returns a one-time phrase and stores only its hash', async () => {
    const email = `reg-${generateId()}@test.invalid`
    const resp = await post(registerRoute, {
      email,
      password: PASSWORD,
      clientPubkey: await realClientPubkey(),
    })
    expect(resp.status).toBe(201)
    const body = (await resp.json()) as { recoveryPhrase?: string }
    expect(body.recoveryPhrase).toBeTruthy()
    expect(body.recoveryPhrase!.split(' ')).toHaveLength(30)

    const rows = await db.select().from(users).where(eq(users.email, email)).limit(1)
    userIds.push(rows[0].id)
    expect(rows[0].recovery_phrase_hash).toBeTruthy()
    expect(rows[0].recovery_phrase_hash).not.toContain(body.recoveryPhrase!)
  }, 30_000)

  it('new-device login requires the phrase; verify-recovery enrolls; retry passes', async () => {
    const email = `flow-${generateId()}@test.invalid`
    const reg = await post(registerRoute, { email, password: PASSWORD, clientPubkey: await realClientPubkey() })
    expect(reg.status).toBe(201)
    const { recoveryPhrase } = (await reg.json()) as { recoveryPhrase: string }
    const rows = await db.select().from(users).where(eq(users.email, email)).limit(1)
    userIds.push(rows[0].id)

    // Login attempt from an unenrolled device: phrase gate fires.
    const gated = await post(loginRoute, { email, password: PASSWORD, clientPubkey: await realClientPubkey() })
    expect(gated.status).toBe(403)
    expect(((await gated.json()) as { code?: string }).code).toBe('RECOVERY_REQUIRED')

    // Wrong phrase is rejected.
    const wrong = await post(verifyRecoveryRoute, {
      email,
      recoveryPhrase: generateRecoveryPhrase(),
      devicePubkey: fakeDevicePubkey(),
    })
    expect(wrong.status).toBe(401)

    // Right phrase enrolls the device.
    const enrolled = await post(verifyRecoveryRoute, {
      email,
      recoveryPhrase,
      devicePubkey: fakeDevicePubkey(),
    })
    expect(enrolled.status).toBe(200)
    const { deviceToken } = (await enrolled.json()) as { deviceToken: string }
    expect(deviceToken).toBeTruthy()

    // Retry the same login with the device token: full session now.
    const ok = await post(loginRoute, {
      email,
      password: PASSWORD,
      clientPubkey: await realClientPubkey(),
      deviceToken,
      devicePubkey: fakeDevicePubkey(),
    })
    expect(ok.status).toBe(200)
  }, 60_000)

  it('rotation burns the old phrase and optionally revokes devices+sessions', async () => {
    const email = `rot-${generateId()}@test.invalid`
    const reg = await post(registerRoute, { email, password: PASSWORD, clientPubkey: await realClientPubkey() })
    const { recoveryPhrase: oldPhrase } = (await reg.json()) as { recoveryPhrase: string }
    const rows = await db.select().from(users).where(eq(users.email, email)).limit(1)
    userIds.push(rows[0].id)
    // regenerate-recovery requires a verified email.
    await db.update(users).set({ email_verified_at: new Date() }).where(eq(users.id, rows[0].id))

    // Enroll two devices.
    const devA = await post(verifyRecoveryRoute, { email, recoveryPhrase: oldPhrase, devicePubkey: fakeDevicePubkey() })
    const devB = await post(verifyRecoveryRoute, { email, recoveryPhrase: oldPhrase, devicePubkey: fakeDevicePubkey() })
    const tokenA = ((await devA.json()) as { deviceToken: string }).deviceToken
    const tokenB = ((await devB.json()) as { deviceToken: string }).deviceToken

    const sessionToken = await insertSession(rows[0].id)

    // Rotate, revoking devices.
    const rotated = await post(regenerateRoute, { revokeDevices: true, revokeOtherSessions: true }, sessionToken)
    expect(rotated.status).toBe(200)
    const { recoveryPhrase: newPhrase } = (await rotated.json()) as { recoveryPhrase: string }
    expect(newPhrase).not.toBe(oldPhrase)

    // Old phrase is dead.
    const oldEnroll = await post(verifyRecoveryRoute, { email, recoveryPhrase: oldPhrase, devicePubkey: fakeDevicePubkey() })
    expect(oldEnroll.status).toBe(401)
    // New phrase works.
    const newEnroll = await post(verifyRecoveryRoute, { email, recoveryPhrase: newPhrase, devicePubkey: fakeDevicePubkey() })
    expect(newEnroll.status).toBe(200)

    // Device tokens were revoked.
    const devRows = await db.select().from(deviceTokens).where(and(
      eq(deviceTokens.user_id, rows[0].id),
      inArray(deviceTokens.token_hash, [await hashToken(tokenA), await hashToken(tokenB)]),
    ))
    expect(devRows.every((d) => d.revoked_at !== null)).toBe(true)
  }, 90_000)

  it('legacy users log in without a device token (phrase gate not applied)', async () => {
    const { userId, email } = await insertLegacyUser()
    userIds.push(userId)
    const resp = await post(loginRoute, { email, password: PASSWORD, clientPubkey: await realClientPubkey() })
    expect(resp.status).toBe(200)
  }, 30_000)
})
