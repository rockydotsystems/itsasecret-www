import { describe, it, expect } from 'vitest'
import { maxRole, ROLE_READ, ROLE_WRITE, ROLE_ADMIN } from './rbac'

describe('maxRole', () => {
  it('returns empty string for no grants', () => {
    expect(maxRole([])).toBe('')
  })

  it('returns the single grant', () => {
    expect(maxRole([ROLE_READ])).toBe(ROLE_READ)
    expect(maxRole([ROLE_ADMIN])).toBe(ROLE_ADMIN)
  })

  it('is additive - the widest grant wins regardless of order', () => {
    expect(maxRole([ROLE_READ, ROLE_WRITE])).toBe(ROLE_WRITE)
    expect(maxRole([ROLE_WRITE, ROLE_READ])).toBe(ROLE_WRITE)
    expect(maxRole([ROLE_READ, ROLE_ADMIN, ROLE_WRITE])).toBe(ROLE_ADMIN)
  })

  it('mixed direct and team grants collapse to the max', () => {
    // direct read + team write + project-team read => write
    expect(maxRole([ROLE_READ, ROLE_WRITE, ROLE_READ])).toBe(ROLE_WRITE)
  })

  it('ignores null, undefined, and unknown role strings', () => {
    expect(maxRole([null, undefined])).toBe('')
    expect(maxRole(['banana', ROLE_READ])).toBe(ROLE_READ)
    expect(maxRole(['banana'])).toBe('')
    expect(maxRole([undefined, ROLE_ADMIN, null])).toBe(ROLE_ADMIN)
  })
})
