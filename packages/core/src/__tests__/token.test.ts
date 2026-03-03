import { describe, it, expect } from 'vitest'
import {
  generateOpaqueToken,
  hashToken,
  safeCompareTokens,
  signJwt,
  verifyJwt,
} from '../utils/token.js'

describe('generateOpaqueToken', () => {
  it('returns a 64-character hex string', () => {
    const token = generateOpaqueToken()
    expect(token).toHaveLength(64)
    expect(token).toMatch(/^[0-9a-f]{64}$/)
  })

  it('generates unique tokens on each call', () => {
    const tokens = new Set(Array.from({ length: 100 }, generateOpaqueToken))
    expect(tokens.size).toBe(100)
  })
})

describe('hashToken', () => {
  it('returns a 64-character hex string (SHA-256)', () => {
    const hash = hashToken('some-raw-token')
    expect(hash).toHaveLength(64)
    expect(hash).toMatch(/^[0-9a-f]{64}$/)
  })

  it('is deterministic for the same input', () => {
    expect(hashToken('abc')).toBe(hashToken('abc'))
  })

  it('produces different hashes for different inputs', () => {
    expect(hashToken('abc')).not.toBe(hashToken('def'))
  })
})

describe('safeCompareTokens', () => {
  it('returns true for identical strings', () => {
    expect(safeCompareTokens('abc123', 'abc123')).toBe(true)
  })

  it('returns false for different strings of the same length', () => {
    expect(safeCompareTokens('abc123', 'xyz789')).toBe(false)
  })

  it('returns false for strings of different lengths', () => {
    expect(safeCompareTokens('short', 'much-longer-string')).toBe(false)
  })
})

describe('signJwt / verifyJwt', () => {
  const secret = 'test-secret-at-least-32-chars-long!!'

  it('signs and verifies a JWT', () => {
    const token = signJwt({ sub: 'user-1', email: 'test@example.com' }, secret)
    const payload = verifyJwt(token, secret)
    expect(payload).not.toBeNull()
    expect(payload?.sub).toBe('user-1')
    expect(payload?.email).toBe('test@example.com')
  })

  it('returns null for an invalid token', () => {
    const result = verifyJwt('not.a.jwt', secret)
    expect(result).toBeNull()
  })

  it('returns null for a token signed with the wrong secret', () => {
    const token = signJwt({ sub: 'user-1', email: 'test@example.com' }, secret)
    const result = verifyJwt(token, 'wrong-secret')
    expect(result).toBeNull()
  })

  it('returns null for an expired token', async () => {
    const token = signJwt({ sub: 'user-1', email: 'test@example.com' }, secret, '-1s')
    const result = verifyJwt(token, secret)
    expect(result).toBeNull()
  })

  it('encodes sub and email in the payload', () => {
    const token = signJwt({ sub: 'abc', email: 'foo@bar.com' }, secret, '1h')
    const payload = verifyJwt(token, secret)
    expect(payload?.sub).toBe('abc')
    expect(payload?.email).toBe('foo@bar.com')
  })
})
