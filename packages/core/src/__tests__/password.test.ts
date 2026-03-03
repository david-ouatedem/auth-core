import { describe, it, expect } from 'vitest'
import { hashPassword, verifyPassword } from '../utils/password.js'

describe('hashPassword', () => {
  it('returns a bcrypt hash string', async () => {
    const hash = await hashPassword('mypassword')
    expect(hash).toMatch(/^\$2[aby]\$/)
  })

  it('produces different hashes for the same password (random salt)', async () => {
    const hash1 = await hashPassword('mypassword')
    const hash2 = await hashPassword('mypassword')
    expect(hash1).not.toBe(hash2)
  })

  it('uses at least 12 rounds even when fewer are requested', async () => {
    // bcrypt hash encodes the rounds: $2b$12$...
    const hash = await hashPassword('mypassword', 10) // tries to use 10
    const rounds = parseInt(hash.split('$')[2] ?? '0', 10)
    expect(rounds).toBeGreaterThanOrEqual(12)
  })
})

describe('verifyPassword', () => {
  it('returns true for a matching password', async () => {
    const hash = await hashPassword('correcthorsebatterystaple')
    const result = await verifyPassword('correcthorsebatterystaple', hash)
    expect(result).toBe(true)
  })

  it('returns false for a non-matching password', async () => {
    const hash = await hashPassword('correcthorsebatterystaple')
    const result = await verifyPassword('wrongpassword', hash)
    expect(result).toBe(false)
  })

  it('returns false for an empty string', async () => {
    const hash = await hashPassword('somepassword')
    const result = await verifyPassword('', hash)
    expect(result).toBe(false)
  })
})
