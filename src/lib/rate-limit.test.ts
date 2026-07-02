import { describe, it, expect, beforeEach } from 'vitest'
import { isRateLimited, recordFailedAttempt, resetAttempts } from './rate-limit'

describe('rate limiter', () => {
  beforeEach(() => {
    resetAttempts('test-key')
  })

  it('allows attempts under the limit', () => {
    expect(isRateLimited('test-key').limited).toBe(false)
    for (let i = 0; i < 9; i++) {
      recordFailedAttempt('test-key')
    }
    expect(isRateLimited('test-key').limited).toBe(false)
  })

  it('blocks after the maximum number of failed attempts', () => {
    for (let i = 0; i < 10; i++) {
      recordFailedAttempt('test-key')
    }
    const result = isRateLimited('test-key')
    expect(result.limited).toBe(true)
    expect(result.retryAfterSeconds).toBeGreaterThan(0)
  })

  it('resets attempts after success', () => {
    for (let i = 0; i < 5; i++) {
      recordFailedAttempt('test-key')
    }
    resetAttempts('test-key')
    expect(isRateLimited('test-key').limited).toBe(false)
  })
})
