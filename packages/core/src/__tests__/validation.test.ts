import { describe, it, expect } from 'vitest'
import {
  registerSchema,
  loginSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
  verifyEmailSchema,
} from '../utils/validation.js'

describe('registerSchema', () => {
  const schema = registerSchema()

  it('accepts valid email and password', () => {
    const result = schema.safeParse({ email: 'user@example.com', password: 'password123' })
    expect(result.success).toBe(true)
  })

  it('rejects invalid email', () => {
    const result = schema.safeParse({ email: 'not-an-email', password: 'password123' })
    expect(result.success).toBe(false)
  })

  it('rejects password shorter than minLength (default 8)', () => {
    const result = schema.safeParse({ email: 'user@example.com', password: 'short' })
    expect(result.success).toBe(false)
  })

  it('rejects password longer than 72 characters', () => {
    const result = schema.safeParse({
      email: 'user@example.com',
      password: 'a'.repeat(73),
    })
    expect(result.success).toBe(false)
  })

  it('accepts password exactly at minLength', () => {
    const result = schema.safeParse({ email: 'user@example.com', password: '12345678' })
    expect(result.success).toBe(true)
  })

  it('respects custom minLength', () => {
    const strictSchema = registerSchema(12)
    const result = strictSchema.safeParse({ email: 'user@example.com', password: 'short' })
    expect(result.success).toBe(false)
  })
})

describe('loginSchema', () => {
  it('accepts valid email and password', () => {
    const result = loginSchema.safeParse({ email: 'user@example.com', password: 'anypass' })
    expect(result.success).toBe(true)
  })

  it('rejects empty password', () => {
    const result = loginSchema.safeParse({ email: 'user@example.com', password: '' })
    expect(result.success).toBe(false)
  })

  it('rejects invalid email', () => {
    const result = loginSchema.safeParse({ email: 'bad', password: 'anypass' })
    expect(result.success).toBe(false)
  })
})

describe('forgotPasswordSchema', () => {
  it('accepts a valid email', () => {
    const result = forgotPasswordSchema.safeParse({ email: 'user@example.com' })
    expect(result.success).toBe(true)
  })

  it('rejects an invalid email', () => {
    const result = forgotPasswordSchema.safeParse({ email: 'bad-email' })
    expect(result.success).toBe(false)
  })
})

describe('resetPasswordSchema', () => {
  const schema = resetPasswordSchema()

  it('accepts valid token and password', () => {
    const result = schema.safeParse({ token: 'sometoken', password: 'newpassword123' })
    expect(result.success).toBe(true)
  })

  it('rejects empty token', () => {
    const result = schema.safeParse({ token: '', password: 'newpassword123' })
    expect(result.success).toBe(false)
  })

  it('rejects weak password', () => {
    const result = schema.safeParse({ token: 'sometoken', password: 'short' })
    expect(result.success).toBe(false)
  })
})

describe('verifyEmailSchema', () => {
  it('accepts a valid token', () => {
    const result = verifyEmailSchema.safeParse({ token: 'abc123' })
    expect(result.success).toBe(true)
  })

  it('rejects empty token', () => {
    const result = verifyEmailSchema.safeParse({ token: '' })
    expect(result.success).toBe(false)
  })
})
