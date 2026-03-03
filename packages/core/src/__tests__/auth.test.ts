import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createAuth, AuthError } from '../auth.js'
import type { DatabaseAdapter } from '../adapters/database.interface.js'
import type { User, Token } from '../types.js'

// ---- helpers ----

function makeUser(overrides: Partial<User> = {}): User {
  return {
    id: 'user-1',
    email: 'test@example.com',
    passwordHash: '$2b$12$notrealhashbutenoughcharstopassvalidation...',
    emailVerified: false,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  }
}

function makeMockDb(overrides: Partial<DatabaseAdapter> = {}): DatabaseAdapter {
  return {
    findUserByEmail: vi.fn().mockResolvedValue(null),
    findUserById: vi.fn().mockResolvedValue(null),
    createUser: vi.fn().mockResolvedValue(makeUser()),
    updateUser: vi.fn().mockResolvedValue(makeUser()),
    createToken: vi.fn().mockResolvedValue({} as Token),
    findToken: vi.fn().mockResolvedValue(null),
    deleteToken: vi.fn().mockResolvedValue(undefined),
    deleteExpiredTokens: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  }
}

const TEST_SECRET = 'test-secret-long-enough-for-jwt-signing-32chars!'

// ---- tests ----

describe('createAuth().register', () => {
  it('creates a user and returns a JWT token', async () => {
    const db = makeMockDb({
      findUserByEmail: vi.fn().mockResolvedValue(null),
      createUser: vi.fn().mockResolvedValue(
        makeUser({ email: 'new@example.com', emailVerified: false }),
      ),
    })
    const auth = createAuth({ db, session: { strategy: 'jwt', secret: TEST_SECRET } })

    const result = await auth.register({ email: 'new@example.com', password: 'password123' })

    expect(result.user.email).toBe('new@example.com')
    expect(result.token).toBeTruthy()
    expect(result.user).not.toHaveProperty('passwordHash')
    expect(db.createUser).toHaveBeenCalledOnce()
  })

  it('throws 409 if email already exists', async () => {
    const db = makeMockDb({
      findUserByEmail: vi.fn().mockResolvedValue(makeUser()),
    })
    const auth = createAuth({ db, session: { strategy: 'jwt', secret: TEST_SECRET } })

    await expect(
      auth.register({ email: 'test@example.com', password: 'password123' }),
    ).rejects.toThrow(AuthError)

    try {
      await auth.register({ email: 'test@example.com', password: 'password123' })
    } catch (err) {
      expect(err).toBeInstanceOf(AuthError)
      expect((err as AuthError).statusCode).toBe(409)
      expect((err as AuthError).code).toBe('EMAIL_EXISTS')
    }
  })

  it('throws 400 on invalid email', async () => {
    const db = makeMockDb()
    const auth = createAuth({ db, session: { strategy: 'jwt', secret: TEST_SECRET } })

    await expect(
      auth.register({ email: 'not-an-email', password: 'password123' }),
    ).rejects.toMatchObject({ statusCode: 400, code: 'VALIDATION_ERROR' })
  })

  it('throws 400 on short password', async () => {
    const db = makeMockDb()
    const auth = createAuth({ db, session: { strategy: 'jwt', secret: TEST_SECRET } })

    await expect(
      auth.register({ email: 'user@example.com', password: 'short' }),
    ).rejects.toMatchObject({ statusCode: 400, code: 'VALIDATION_ERROR' })
  })

  it('calls onSignUp callback after successful registration', async () => {
    const onSignUp = vi.fn()
    const db = makeMockDb({
      findUserByEmail: vi.fn().mockResolvedValue(null),
    })
    const auth = createAuth({
      db,
      session: { strategy: 'jwt', secret: TEST_SECRET },
      callbacks: { onSignUp },
    })

    await auth.register({ email: 'new@example.com', password: 'password123' })
    expect(onSignUp).toHaveBeenCalledOnce()
    expect(onSignUp.mock.calls[0]?.[0]).not.toHaveProperty('passwordHash')
  })
})

describe('createAuth().login', () => {
  it('returns user and token for valid credentials', async () => {
    // Use a real bcrypt hash for 'password123'
    const { hashPassword } = await import('../utils/password.js')
    const realHash = await hashPassword('password123')
    const db = makeMockDb({
      findUserByEmail: vi.fn().mockResolvedValue(
        makeUser({ passwordHash: realHash, emailVerified: true }),
      ),
    })
    const auth = createAuth({ db, session: { strategy: 'jwt', secret: TEST_SECRET } })

    const result = await auth.login({ email: 'test@example.com', password: 'password123' })
    expect(result.user.email).toBe('test@example.com')
    expect(result.token).toBeTruthy()
  })

  it('throws 401 for wrong password', async () => {
    const { hashPassword } = await import('../utils/password.js')
    const realHash = await hashPassword('correctpassword')
    const db = makeMockDb({
      findUserByEmail: vi.fn().mockResolvedValue(
        makeUser({ passwordHash: realHash, emailVerified: true }),
      ),
    })
    const auth = createAuth({ db, session: { strategy: 'jwt', secret: TEST_SECRET } })

    await expect(
      auth.login({ email: 'test@example.com', password: 'wrongpassword' }),
    ).rejects.toMatchObject({ statusCode: 401, code: 'INVALID_CREDENTIALS' })
  })

  it('throws 401 if user not found', async () => {
    const db = makeMockDb({ findUserByEmail: vi.fn().mockResolvedValue(null) })
    const auth = createAuth({ db, session: { strategy: 'jwt', secret: TEST_SECRET } })

    await expect(
      auth.login({ email: 'nobody@example.com', password: 'password123' }),
    ).rejects.toMatchObject({ statusCode: 401, code: 'INVALID_CREDENTIALS' })
  })

  it('throws 403 if email not verified and emailVerification feature is enabled', async () => {
    const { hashPassword } = await import('../utils/password.js')
    const realHash = await hashPassword('password123')
    const db = makeMockDb({
      findUserByEmail: vi.fn().mockResolvedValue(
        makeUser({ passwordHash: realHash, emailVerified: false }),
      ),
    })
    const auth = createAuth({
      db,
      session: { strategy: 'jwt', secret: TEST_SECRET },
      features: ['emailVerification'],
    })

    await expect(
      auth.login({ email: 'test@example.com', password: 'password123' }),
    ).rejects.toMatchObject({ statusCode: 403, code: 'EMAIL_NOT_VERIFIED' })
  })
})

describe('createAuth().verifyToken', () => {
  it('returns public user for a valid token', async () => {
    const { signJwt } = await import('../utils/token.js')
    const token = signJwt({ sub: 'user-1', email: 'test@example.com' }, TEST_SECRET)
    const db = makeMockDb({
      findUserById: vi.fn().mockResolvedValue(makeUser({ emailVerified: true })),
    })
    const auth = createAuth({ db, session: { strategy: 'jwt', secret: TEST_SECRET } })

    const user = await auth.verifyToken(token)
    expect(user).not.toBeNull()
    expect(user?.id).toBe('user-1')
  })

  it('returns null for an invalid token', async () => {
    const db = makeMockDb()
    const auth = createAuth({ db, session: { strategy: 'jwt', secret: TEST_SECRET } })

    const user = await auth.verifyToken('garbage.token.value')
    expect(user).toBeNull()
  })

  it('returns null if user no longer exists in DB', async () => {
    const { signJwt } = await import('../utils/token.js')
    const token = signJwt({ sub: 'deleted-user', email: 'gone@example.com' }, TEST_SECRET)
    const db = makeMockDb({ findUserById: vi.fn().mockResolvedValue(null) })
    const auth = createAuth({ db, session: { strategy: 'jwt', secret: TEST_SECRET } })

    const user = await auth.verifyToken(token)
    expect(user).toBeNull()
  })
})
