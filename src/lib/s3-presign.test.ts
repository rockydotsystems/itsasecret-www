import { describe, it, expect } from 'vitest'
import { presignGetUrl } from './s3-presign'

describe('presignGetUrl', () => {
  // Known-answer vector from the AWS SigV4 docs ("Authenticating Requests:
  // Using Query Parameters"): GET test.txt from examplebucket, us-east-1,
  // 2013-05-24T00:00:00Z, 86400s expiry.
  it('matches the AWS documentation example signature', () => {
    const url = presignGetUrl({
      endpoint: 'https://s3.amazonaws.com',
      bucket: 'examplebucket',
      region: 'us-east-1',
      accessKeyId: 'AKIAIOSFODNN7EXAMPLE',
      secretAccessKey: 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY',
      key: 'test.txt',
      expiresSeconds: 86400,
      now: new Date('2013-05-24T00:00:00Z'),
    })
    const parsed = new URL(url)
    expect(parsed.host).toBe('examplebucket.s3.amazonaws.com')
    expect(parsed.pathname).toBe('/test.txt')
    expect(parsed.searchParams.get('X-Amz-Date')).toBe('20130524T000000Z')
    expect(parsed.searchParams.get('X-Amz-Signature')).toBe(
      'aeeed9bbccd4d02ee5c0109b86d86835f995330da4c265957d157751f604d404',
    )
  })

  it('encodes nested object keys per path segment', () => {
    const url = presignGetUrl({
      endpoint: 'https://storage.railway.app',
      bucket: 'my-bucket',
      region: 'auto',
      accessKeyId: 'key',
      secretAccessKey: 'secret',
      key: 'cli/latest/itsasecret_linux_amd64',
      expiresSeconds: 300,
      now: new Date('2026-07-05T00:00:00Z'),
    })
    const parsed = new URL(url)
    expect(parsed.host).toBe('my-bucket.storage.railway.app')
    expect(parsed.pathname).toBe('/cli/latest/itsasecret_linux_amd64')
    expect(parsed.searchParams.get('X-Amz-Expires')).toBe('300')
  })
})
