import { describe, it, expect } from 'vitest'
import { createHmac } from 'node:crypto'
import { verifyWebhookSignature } from './stripe'

// Reference HMAC from Node's crypto (a different implementation than the
// Web Crypto path under test) so the two cross-check each other.
function referenceSign(secret: string, timestamp: string, body: string): string {
  return createHmac('sha256', secret).update(`${timestamp}.${body}`).digest('hex')
}

const SECRET = 'whsec_testsecret'
const BODY = '{"id":"evt_1","type":"checkout.session.completed","data":{"object":{}}}'

function headerFor(timestamp: number, sig: string): string {
  return `t=${timestamp},v1=${sig}`
}

describe('verifyWebhookSignature', () => {
  it('accepts a correctly signed payload', async () => {
    const now = 1_800_000_000
    const sig = referenceSign(SECRET, String(now), BODY)
    await expect(verifyWebhookSignature(BODY, headerFor(now, sig), SECRET, now)).resolves.toBe(true)
  })

  it('rejects a tampered body', async () => {
    const now = 1_800_000_000
    const sig = referenceSign(SECRET, String(now), BODY)
    await expect(verifyWebhookSignature(BODY + ' ', headerFor(now, sig), SECRET, now)).resolves.toBe(false)
  })

  it('rejects the wrong secret', async () => {
    const now = 1_800_000_000
    const sig = referenceSign('whsec_other', String(now), BODY)
    await expect(verifyWebhookSignature(BODY, headerFor(now, sig), SECRET, now)).resolves.toBe(false)
  })

  it('accepts any matching v1 when several are present (key rotation)', async () => {
    const now = 1_800_000_000
    const good = referenceSign(SECRET, String(now), BODY)
    const bad = referenceSign('whsec_old', String(now), BODY)
    await expect(verifyWebhookSignature(BODY, `t=${now},v1=${bad},v1=${good}`, SECRET, now)).resolves.toBe(true)
  })

  it('rejects timestamps outside the tolerance window', async () => {
    const now = 1_800_000_000
    const stale = now - 301
    const sig = referenceSign(SECRET, String(stale), BODY)
    await expect(verifyWebhookSignature(BODY, headerFor(stale, sig), SECRET, now)).resolves.toBe(false)
  })

  it('accepts a timestamp at the edge of the window', async () => {
    const now = 1_800_000_000
    const edge = now - 300
    const sig = referenceSign(SECRET, String(edge), BODY)
    await expect(verifyWebhookSignature(BODY, headerFor(edge, sig), SECRET, now)).resolves.toBe(true)
  })

  it('rejects a missing or malformed header', async () => {
    const now = 1_800_000_000
    await expect(verifyWebhookSignature(BODY, null, SECRET, now)).resolves.toBe(false)
    await expect(verifyWebhookSignature(BODY, '', SECRET, now)).resolves.toBe(false)
    await expect(verifyWebhookSignature(BODY, 'v1=abc', SECRET, now)).resolves.toBe(false)
    await expect(verifyWebhookSignature(BODY, `t=${now}`, SECRET, now)).resolves.toBe(false)
  })
})
