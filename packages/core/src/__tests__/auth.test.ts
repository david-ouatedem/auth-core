import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createAuth, AuthError } from '../auth.js'
import type { DatabaseAdapter, User, Token } from '@authcore/types'
import { createCaptureEmail, extractTokenFromUrl } from './helpers/captureEmailAdapter.js'
import { hashToken } from '../utils/token.js'

// ---- helpers ----

function makeUser(overrides: Partial<User> = {}): User {
  return {
    id: 'user-1',
    email: 'test@example.com',
    passwordHash: '$2b$12$notrealhashbutenoughcharstopassvalidation...',
    emailVerified: false,
    role: 'user',
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
    deleteTokensByUserAndType: vi.fn().mockResolvedValue(undefined),
    findOAuthAccount: vi.fn().mockResolvedValue(null),
    createOAuthAccount: vi.fn().mockImplementation(async (data) => ({
      id: 'oauth-1',
      userId: data.userId,
      provider: data.provider,
      providerAccountId: data.providerAccountId,
      accessToken: data.accessToken,
      refreshToken: data.refreshToken ?? null,
      expiresAt: data.expiresAt ?? null,
      createdAt: new Date(),
      updatedAt: new Date(),
    })),
    updateOAuthAccount: vi.fn().mockImplementation(async (id, data) => ({
      id,
      userId: 'user-1',
      provider: 'google',
      providerAccountId: 'remote-1',
      accessToken: data.accessToken ?? 'access',
      refreshToken: data.refreshToken ?? null,
      expiresAt: data.expiresAt ?? null,
      createdAt: new Date(),
      updatedAt: new Date(),
    })),
    ...overrides,
  }
}

function makeFakeProvider(overrides: {
  id?: string
  exchangeCode?: (params: { code: string; codeVerifier: string; redirectUri: string }) => Promise<{
    accessToken: string
    refreshToken?: string
    expiresIn?: number
    idToken?: string
  }>
  getUserInfo?: (
    accessToken: string,
    idToken?: string,
  ) => Promise<{ id: string; email: string; emailVerified: boolean; name?: string; picture?: string }>
} = {}) {
  return {
    id: overrides.id ?? 'google',
    scopes: ['openid', 'email', 'profile'],
    authorize: ({ state, codeChallenge, redirectUri }: { state: string; codeChallenge: string; redirectUri: string }) =>
      `https://provider.example/authorize?state=${state}&challenge=${codeChallenge}&redirect=${encodeURIComponent(redirectUri)}`,
    exchangeCode:
      overrides.exchangeCode ??
      (async () => ({ accessToken: 'remote-access', refreshToken: 'remote-refresh', expiresIn: 3600 })),
    getUserInfo:
      overrides.getUserInfo ??
      (async () => ({ id: 'remote-1', email: 'remote@example.com', emailVerified: true, name: 'Remote User' })),
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
    const token = signJwt({ sub: 'user-1', email: 'test@example.com', role: 'user' }, TEST_SECRET)
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
    const token = signJwt({ sub: 'deleted-user', email: 'gone@example.com', role: 'user' }, TEST_SECRET)
    const db = makeMockDb({ findUserById: vi.fn().mockResolvedValue(null) })
    const auth = createAuth({ db, session: { strategy: 'jwt', secret: TEST_SECRET } })

    const user = await auth.verifyToken(token)
    expect(user).toBeNull()
  })
})

// ---- RBAC ----

describe('RBAC', () => {
  it('register assigns default role "user"', async () => {
    const db = makeMockDb({
      findUserByEmail: vi.fn().mockResolvedValue(null),
      createUser: vi.fn().mockResolvedValue(makeUser({ role: 'user' })),
    })
    const auth = createAuth({ db, session: { strategy: 'jwt', secret: TEST_SECRET } })

    const result = await auth.register({ email: 'new@example.com', password: 'password123' })
    expect(result.user.role).toBe('user')
    expect(db.createUser).toHaveBeenCalledWith(
      expect.objectContaining({ role: 'user' }),
    )
  })

  it('register uses custom default role from rbac config', async () => {
    const db = makeMockDb({
      findUserByEmail: vi.fn().mockResolvedValue(null),
      createUser: vi.fn().mockResolvedValue(makeUser({ role: 'member' })),
    })
    const auth = createAuth({
      db,
      session: { strategy: 'jwt', secret: TEST_SECRET },
      rbac: { defaultRole: 'member' },
    })

    const result = await auth.register({ email: 'new@example.com', password: 'password123' })
    expect(result.user.role).toBe('member')
    expect(db.createUser).toHaveBeenCalledWith(
      expect.objectContaining({ role: 'member' }),
    )
  })

  it('JWT contains role claim', async () => {
    const db = makeMockDb({
      findUserByEmail: vi.fn().mockResolvedValue(null),
      createUser: vi.fn().mockResolvedValue(makeUser({ role: 'admin' })),
    })
    const auth = createAuth({ db, session: { strategy: 'jwt', secret: TEST_SECRET } })

    const result = await auth.register({ email: 'admin@example.com', password: 'password123' })
    const { verifyJwt } = await import('../utils/token.js')
    const payload = verifyJwt(result.token, TEST_SECRET)
    expect(payload?.role).toBe('admin')
  })

  it('login JWT contains role claim', async () => {
    const { hashPassword } = await import('../utils/password.js')
    const realHash = await hashPassword('password123')
    const db = makeMockDb({
      findUserByEmail: vi.fn().mockResolvedValue(
        makeUser({ passwordHash: realHash, emailVerified: true, role: 'editor' }),
      ),
    })
    const auth = createAuth({ db, session: { strategy: 'jwt', secret: TEST_SECRET } })

    const result = await auth.login({ email: 'test@example.com', password: 'password123' })
    expect(result.user.role).toBe('editor')
    const { verifyJwt } = await import('../utils/token.js')
    const payload = verifyJwt(result.token, TEST_SECRET)
    expect(payload?.role).toBe('editor')
  })
})

// ---- Invitation ----

describe('createAuth().invite', () => {
  it('throws FEATURE_DISABLED when invitation is not enabled', async () => {
    const db = makeMockDb()
    const auth = createAuth({ db, session: { strategy: 'jwt', secret: TEST_SECRET } })

    await expect(
      auth.invite({ email: 'invite@example.com' }, { inviteUrl: 'https://app.com/accept' }),
    ).rejects.toMatchObject({ statusCode: 500, code: 'FEATURE_DISABLED' })
  })

  it('throws EMAIL_NOT_CONFIGURED when no email provider', async () => {
    const db = makeMockDb()
    const auth = createAuth({
      db,
      session: { strategy: 'jwt', secret: TEST_SECRET },
      features: ['invitation'],
    })

    await expect(
      auth.invite({ email: 'invite@example.com' }, { inviteUrl: 'https://app.com/accept' }),
    ).rejects.toMatchObject({ statusCode: 500, code: 'EMAIL_NOT_CONFIGURED' })
  })

  it('throws EMAIL_EXISTS when user already exists', async () => {
    const db = makeMockDb({
      findUserByEmail: vi.fn().mockResolvedValue(makeUser()),
    })
    const mockEmailProvider = { send: vi.fn().mockResolvedValue(undefined) }
    const auth = createAuth({
      db,
      session: { strategy: 'jwt', secret: TEST_SECRET },
      features: ['invitation'],
      email: { provider: mockEmailProvider, from: 'auth@test.com' },
    })

    await expect(
      auth.invite({ email: 'test@example.com' }, { inviteUrl: 'https://app.com/accept' }),
    ).rejects.toMatchObject({ statusCode: 409, code: 'EMAIL_EXISTS' })
  })
})

describe('createAuth().acceptInvitation', () => {
  it('throws VALIDATION_ERROR on missing token', async () => {
    const db = makeMockDb()
    const auth = createAuth({ db, session: { strategy: 'jwt', secret: TEST_SECRET } })

    await expect(
      auth.acceptInvitation({ token: '', password: 'password123' }),
    ).rejects.toMatchObject({ statusCode: 400, code: 'VALIDATION_ERROR' })
  })

  it('throws VALIDATION_ERROR on short password', async () => {
    const db = makeMockDb()
    const auth = createAuth({ db, session: { strategy: 'jwt', secret: TEST_SECRET } })

    await expect(
      auth.acceptInvitation({ token: 'some-token', password: 'short' }),
    ).rejects.toMatchObject({ statusCode: 400, code: 'VALIDATION_ERROR' })
  })

  it('throws INVALID_TOKEN when token is not found', async () => {
    const db = makeMockDb({
      findToken: vi.fn().mockResolvedValue(null),
    })
    const auth = createAuth({ db, session: { strategy: 'jwt', secret: TEST_SECRET } })

    await expect(
      auth.acceptInvitation({ token: 'invalid-token-value', password: 'password123' }),
    ).rejects.toMatchObject({ statusCode: 400, code: 'INVALID_TOKEN' })
  })
})

// ---- forgotPassword / resetPassword ----

describe('createAuth().forgotPassword', () => {
  it('is a no-op when passwordReset feature is disabled', async () => {
    const capture = createCaptureEmail()
    const db = makeMockDb({ findUserByEmail: vi.fn().mockResolvedValue(makeUser()) })
    const auth = createAuth({
      db,
      session: { strategy: 'jwt', secret: TEST_SECRET },
      email: { provider: capture.provider, from: 'auth@test.com' },
    })

    await auth.forgotPassword({ email: 'test@example.com' }, { resetUrl: 'https://app.com/reset' })
    expect(capture.sent).toHaveLength(0)
  })

  it('is a no-op when no email provider is configured', async () => {
    const db = makeMockDb({ findUserByEmail: vi.fn().mockResolvedValue(makeUser()) })
    const auth = createAuth({
      db,
      session: { strategy: 'jwt', secret: TEST_SECRET },
      features: ['passwordReset'],
    })

    // Should not throw — feature enabled but email missing is a soft no-op
    await expect(
      auth.forgotPassword({ email: 'test@example.com' }, { resetUrl: 'https://app.com/reset' }),
    ).resolves.toBeUndefined()
  })

  it('throws MISSING_URL when resetUrl is not provided', async () => {
    const capture = createCaptureEmail()
    const db = makeMockDb({ findUserByEmail: vi.fn().mockResolvedValue(makeUser()) })
    const auth = createAuth({
      db,
      session: { strategy: 'jwt', secret: TEST_SECRET },
      features: ['passwordReset'],
      email: { provider: capture.provider, from: 'auth@test.com' },
    })

    await expect(
      auth.forgotPassword({ email: 'test@example.com' }),
    ).rejects.toMatchObject({ statusCode: 500, code: 'MISSING_URL' })
    expect(capture.sent).toHaveLength(0)
  })

  it('sends email with the supplied resetUrl and DOES NOT leak the session secret', async () => {
    const capture = createCaptureEmail()
    const db = makeMockDb({
      findUserByEmail: vi.fn().mockResolvedValue(makeUser()),
      createToken: vi.fn().mockResolvedValue({} as Token),
    })
    const auth = createAuth({
      db,
      session: { strategy: 'jwt', secret: TEST_SECRET },
      features: ['passwordReset'],
      email: { provider: capture.provider, from: 'auth@test.com' },
    })

    await auth.forgotPassword(
      { email: 'test@example.com' },
      { resetUrl: 'https://app.com/reset-password' },
    )

    expect(capture.sent).toHaveLength(1)
    const email = capture.last()!
    expect(email.to).toBe('test@example.com')
    expect(email.html).toContain('https://app.com/reset-password?token=')
    expect(email.text).toContain('https://app.com/reset-password?token=')
    // Regression: secret must never appear in the email body
    expect(email.html).not.toContain(TEST_SECRET)
    expect(email.text).not.toContain(TEST_SECRET)
  })

  it('always succeeds even when the email does not exist (no enumeration)', async () => {
    const capture = createCaptureEmail()
    const db = makeMockDb({ findUserByEmail: vi.fn().mockResolvedValue(null) })
    const auth = createAuth({
      db,
      session: { strategy: 'jwt', secret: TEST_SECRET },
      features: ['passwordReset'],
      email: { provider: capture.provider, from: 'auth@test.com' },
    })

    await expect(
      auth.forgotPassword(
        { email: 'nobody@example.com' },
        { resetUrl: 'https://app.com/reset' },
      ),
    ).resolves.toBeUndefined()
    expect(capture.sent).toHaveLength(0)
  })
})

describe('createAuth().resetPassword', () => {
  it('updates the user password and deletes the token on success', async () => {
    const rawToken = 'raw-token-for-reset'
    const hashedToken = hashToken(rawToken)
    const tokenRecord: Token = {
      id: 'token-1',
      userId: 'user-1',
      type: 'PASSWORD_RESET',
      token: hashedToken,
      expiresAt: new Date(Date.now() + 60_000),
      createdAt: new Date(),
    }
    const updateUser = vi.fn().mockResolvedValue(makeUser())
    const deleteToken = vi.fn().mockResolvedValue(undefined)
    const db = makeMockDb({
      findToken: vi.fn().mockResolvedValue(tokenRecord),
      updateUser,
      deleteToken,
      findUserById: vi.fn().mockResolvedValue(makeUser()),
    })
    const auth = createAuth({ db, session: { strategy: 'jwt', secret: TEST_SECRET } })

    await auth.resetPassword({ token: rawToken, password: 'newpassword123' })

    expect(updateUser).toHaveBeenCalledWith(
      'user-1',
      expect.objectContaining({ passwordHash: expect.any(String) }),
    )
    expect(deleteToken).toHaveBeenCalledWith('token-1')
  })
})

// ---- sendEmailVerification / verifyEmail ----

describe('createAuth().sendEmailVerification', () => {
  it('throws FEATURE_DISABLED when feature is not enabled', async () => {
    const db = makeMockDb()
    const auth = createAuth({ db, session: { strategy: 'jwt', secret: TEST_SECRET } })

    await expect(
      auth.sendEmailVerification({
        userId: 'user-1',
        email: 'test@example.com',
        verificationUrl: 'https://app.com/verify',
      }),
    ).rejects.toMatchObject({ statusCode: 500, code: 'FEATURE_DISABLED' })
  })

  it('sends a verification email with the supplied verificationUrl', async () => {
    const capture = createCaptureEmail()
    const db = makeMockDb({ createToken: vi.fn().mockResolvedValue({} as Token) })
    const auth = createAuth({
      db,
      session: { strategy: 'jwt', secret: TEST_SECRET },
      features: ['emailVerification'],
      email: { provider: capture.provider, from: 'auth@test.com' },
    })

    await auth.sendEmailVerification({
      userId: 'user-1',
      email: 'newuser@example.com',
      verificationUrl: 'https://app.com/verify-email',
    })

    expect(capture.sent).toHaveLength(1)
    const email = capture.last()!
    expect(email.to).toBe('newuser@example.com')
    expect(email.html).toMatch(/https:\/\/app\.com\/verify-email\?token=[a-f0-9]+/)
    expect(email.html).not.toContain(TEST_SECRET)
  })
})

describe('createAuth().verifyEmail (happy path)', () => {
  it('sets emailVerified=true and deletes the token', async () => {
    const rawToken = 'raw-verification-token'
    const tokenRecord: Token = {
      id: 'token-1',
      userId: 'user-1',
      type: 'EMAIL_VERIFICATION',
      token: hashToken(rawToken),
      expiresAt: new Date(Date.now() + 60_000),
      createdAt: new Date(),
    }
    const updateUser = vi.fn().mockResolvedValue(makeUser({ emailVerified: true }))
    const deleteToken = vi.fn().mockResolvedValue(undefined)
    const db = makeMockDb({
      findToken: vi.fn().mockResolvedValue(tokenRecord),
      updateUser,
      deleteToken,
    })
    const auth = createAuth({ db, session: { strategy: 'jwt', secret: TEST_SECRET } })

    await auth.verifyEmail({ token: rawToken })

    expect(updateUser).toHaveBeenCalledWith('user-1', { emailVerified: true })
    expect(deleteToken).toHaveBeenCalledWith('token-1')
  })
})

// ---- invite / acceptInvitation happy paths ----

describe('createAuth().invite (happy path)', () => {
  it('creates the invited user and sends an email containing the inviteUrl', async () => {
    const capture = createCaptureEmail()
    const createUser = vi.fn().mockResolvedValue(makeUser({ email: 'invited@example.com', role: 'editor' }))
    const db = makeMockDb({
      findUserByEmail: vi.fn().mockResolvedValue(null),
      createUser,
      createToken: vi.fn().mockResolvedValue({} as Token),
    })
    const auth = createAuth({
      db,
      session: { strategy: 'jwt', secret: TEST_SECRET },
      features: ['invitation'],
      email: { provider: capture.provider, from: 'auth@test.com' },
    })

    await auth.invite(
      { email: 'invited@example.com', role: 'editor' },
      { inviteUrl: 'https://app.com/accept-invitation' },
    )

    expect(createUser).toHaveBeenCalledWith(expect.objectContaining({
      email: 'invited@example.com',
      role: 'editor',
    }))
    expect(capture.sent).toHaveLength(1)
    expect(capture.last()!.html).toContain('https://app.com/accept-invitation?token=')
    expect(capture.last()!.html).not.toContain(TEST_SECRET)
  })
})

describe('createAuth().acceptInvitation (happy path)', () => {
  it('sets password, marks email verified, and returns a JWT', async () => {
    const rawToken = 'raw-invite-token'
    const tokenRecord: Token = {
      id: 'token-1',
      userId: 'user-1',
      type: 'INVITATION',
      token: hashToken(rawToken),
      expiresAt: new Date(Date.now() + 60_000),
      createdAt: new Date(),
    }
    const updatedUser = makeUser({ id: 'user-1', email: 'invited@example.com', emailVerified: true })
    const updateUser = vi.fn().mockResolvedValue(updatedUser)
    const db = makeMockDb({
      findToken: vi.fn().mockResolvedValue(tokenRecord),
      findUserById: vi.fn().mockResolvedValue(updatedUser),
      updateUser,
      deleteToken: vi.fn().mockResolvedValue(undefined),
    })
    const auth = createAuth({ db, session: { strategy: 'jwt', secret: TEST_SECRET } })

    const result = await auth.acceptInvitation({ token: rawToken, password: 'mypassword123' })

    expect(result.user.email).toBe('invited@example.com')
    expect(result.token).toBeTruthy()
    expect(updateUser).toHaveBeenCalledWith(
      'user-1',
      expect.objectContaining({ emailVerified: true, passwordHash: expect.any(String) }),
    )
  })
})

// ---- AuthCore.config exposure ----

describe('createAuth() exposes config', () => {
  it('returns a config property that round-trips the input config', () => {
    const db = makeMockDb()
    const config = {
      db,
      session: { strategy: 'jwt' as const, secret: TEST_SECRET, cookieName: 'my_token' },
    }
    const auth = createAuth(config)
    expect(auth.config.session.cookieName).toBe('my_token')
    expect(auth.config.session.secret).toBe(TEST_SECRET)
  })

  it('extractTokenFromUrl helper recovers the raw token', () => {
    expect(extractTokenFromUrl('https://app.com/reset?token=abc123')).toBe('abc123')
    expect(extractTokenFromUrl('https://app.com/reset-password?foo=1&token=abc123&bar=2')).toBe('abc123')
  })
})

// ---- 0.10: Email template overrides ----

describe('EmailTemplates', () => {
  it('calls a custom verifyEmail template with { email, link, ttlHours: 24 }', async () => {
    const customTemplate = vi.fn().mockReturnValue({
      subject: 'Custom verify',
      html: '<p>Custom HTML</p>',
      text: 'Custom text',
    })
    const capture = createCaptureEmail()
    const db = makeMockDb({ createToken: vi.fn().mockResolvedValue({} as Token) })
    const auth = createAuth({
      db,
      session: { strategy: 'jwt', secret: TEST_SECRET },
      features: ['emailVerification'],
      email: {
        provider: capture.provider,
        from: 'auth@test.com',
        templates: { verifyEmail: customTemplate },
      },
    })

    await auth.sendEmailVerification({
      userId: 'user-1',
      email: 'verify@example.com',
      verificationUrl: 'https://app.com/verify',
    })

    expect(customTemplate).toHaveBeenCalledOnce()
    const ctx = customTemplate.mock.calls[0]![0] as { email: string; link: string; ttlHours: number }
    expect(ctx.email).toBe('verify@example.com')
    expect(ctx.link).toMatch(/^https:\/\/app\.com\/verify\?token=[a-f0-9]+$/)
    expect(ctx.ttlHours).toBe(24)

    expect(capture.sent).toHaveLength(1)
    expect(capture.last()!.subject).toBe('Custom verify')
    expect(capture.last()!.html).toBe('<p>Custom HTML</p>')
    expect(capture.last()!.text).toBe('Custom text')
  })

  it('calls a custom resetPassword template with ttlHours: 1', async () => {
    const customTemplate = vi.fn().mockReturnValue({
      subject: 'Custom reset',
      html: '<p>Reset HTML</p>',
      text: 'Reset text',
    })
    const capture = createCaptureEmail()
    const db = makeMockDb({ findUserByEmail: vi.fn().mockResolvedValue(makeUser()) })
    const auth = createAuth({
      db,
      session: { strategy: 'jwt', secret: TEST_SECRET },
      features: ['passwordReset'],
      email: {
        provider: capture.provider,
        from: 'auth@test.com',
        templates: { resetPassword: customTemplate },
      },
    })

    await auth.forgotPassword(
      { email: 'test@example.com' },
      { resetUrl: 'https://app.com/reset-password' },
    )

    expect(customTemplate).toHaveBeenCalledOnce()
    expect((customTemplate.mock.calls[0]![0] as { ttlHours: number }).ttlHours).toBe(1)
    expect(capture.last()!.subject).toBe('Custom reset')
  })

  it('calls a custom invitation template with { email, link, ttlHours: 48, role }', async () => {
    const customTemplate = vi.fn().mockReturnValue({
      subject: 'Welcome',
      html: '<p>Invite HTML</p>',
      text: 'Invite text',
    })
    const capture = createCaptureEmail()
    const db = makeMockDb({
      findUserByEmail: vi.fn().mockResolvedValue(null),
      createUser: vi.fn().mockResolvedValue(makeUser({ email: 'invited@example.com', role: 'editor' })),
    })
    const auth = createAuth({
      db,
      session: { strategy: 'jwt', secret: TEST_SECRET },
      features: ['invitation'],
      email: {
        provider: capture.provider,
        from: 'auth@test.com',
        templates: { invitation: customTemplate },
      },
    })

    await auth.invite(
      { email: 'invited@example.com', role: 'editor' },
      { inviteUrl: 'https://app.com/accept' },
    )

    expect(customTemplate).toHaveBeenCalledOnce()
    const ctx = customTemplate.mock.calls[0]![0] as { email: string; ttlHours: number; role: string }
    expect(ctx.email).toBe('invited@example.com')
    expect(ctx.role).toBe('editor')
    expect(ctx.ttlHours).toBe(48)
    expect(capture.last()!.subject).toBe('Welcome')
  })

  it('falls back to default template when override is not supplied', async () => {
    const capture = createCaptureEmail()
    const db = makeMockDb({ createToken: vi.fn().mockResolvedValue({} as Token) })
    const auth = createAuth({
      db,
      session: { strategy: 'jwt', secret: TEST_SECRET },
      features: ['emailVerification'],
      email: { provider: capture.provider, from: 'auth@test.com' },
    })

    await auth.sendEmailVerification({
      userId: 'user-1',
      email: 'verify@example.com',
      verificationUrl: 'https://app.com/verify',
    })

    expect(capture.last()!.subject).toBe('Verify your email address')
    expect(capture.last()!.html).toContain('https://app.com/verify?token=')
  })
})

// ---- 0.10: Refresh tokens ----

describe('createAuth().register/login return refreshToken', () => {
  it('register returns a non-empty refreshToken', async () => {
    const db = makeMockDb({
      findUserByEmail: vi.fn().mockResolvedValue(null),
      createUser: vi.fn().mockResolvedValue(makeUser()),
      createToken: vi.fn().mockResolvedValue({} as Token),
    })
    const auth = createAuth({ db, session: { strategy: 'jwt', secret: TEST_SECRET } })
    const result = await auth.register({ email: 'new@example.com', password: 'password123' })
    expect(result.refreshToken).toBeTruthy()
    expect(result.refreshToken.length).toBe(64) // hex of 32 bytes
    expect(db.createToken).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'REFRESH' }),
    )
  })

  it('login returns a non-empty refreshToken', async () => {
    const { hashPassword } = await import('../utils/password.js')
    const realHash = await hashPassword('password123')
    const db = makeMockDb({
      findUserByEmail: vi.fn().mockResolvedValue(makeUser({ passwordHash: realHash, emailVerified: true })),
      createToken: vi.fn().mockResolvedValue({} as Token),
    })
    const auth = createAuth({ db, session: { strategy: 'jwt', secret: TEST_SECRET } })
    const result = await auth.login({ email: 'test@example.com', password: 'password123' })
    expect(result.refreshToken).toBeTruthy()
    expect(result.refreshToken.length).toBe(64)
  })
})

describe('createAuth().refresh', () => {
  it('throws INVALID_TOKEN (401) when refresh token is missing', async () => {
    const db = makeMockDb()
    const auth = createAuth({ db, session: { strategy: 'jwt', secret: TEST_SECRET } })
    await expect(auth.refresh('')).rejects.toMatchObject({
      statusCode: 401,
      code: 'INVALID_TOKEN',
    })
  })

  it('throws INVALID_TOKEN when the refresh token is not in the DB', async () => {
    const db = makeMockDb({ findToken: vi.fn().mockResolvedValue(null) })
    const auth = createAuth({ db, session: { strategy: 'jwt', secret: TEST_SECRET } })
    await expect(auth.refresh('nonexistent')).rejects.toMatchObject({
      statusCode: 401,
      code: 'INVALID_TOKEN',
    })
  })

  it('throws INVALID_TOKEN when the refresh token is expired (and deletes the row)', async () => {
    const expiredToken: Token = {
      id: 'rt-1',
      userId: 'user-1',
      type: 'REFRESH',
      token: 'hash',
      expiresAt: new Date(Date.now() - 1000),
      createdAt: new Date(),
    }
    const deleteToken = vi.fn().mockResolvedValue(undefined)
    const db = makeMockDb({
      findToken: vi.fn().mockResolvedValue(expiredToken),
      deleteToken,
    })
    const auth = createAuth({ db, session: { strategy: 'jwt', secret: TEST_SECRET } })
    await expect(auth.refresh('expired')).rejects.toMatchObject({
      statusCode: 401,
      code: 'INVALID_TOKEN',
    })
    expect(deleteToken).toHaveBeenCalledWith('rt-1')
  })

  it('rotates: returns new tokens and deletes old refresh row', async () => {
    const validToken: Token = {
      id: 'rt-1',
      userId: 'user-1',
      type: 'REFRESH',
      token: 'hash',
      expiresAt: new Date(Date.now() + 60_000),
      createdAt: new Date(),
    }
    const deleteToken = vi.fn().mockResolvedValue(undefined)
    const createToken = vi.fn().mockResolvedValue({} as Token)
    const db = makeMockDb({
      findToken: vi.fn().mockResolvedValue(validToken),
      findUserById: vi.fn().mockResolvedValue(makeUser({ id: 'user-1' })),
      deleteToken,
      createToken,
    })
    const auth = createAuth({ db, session: { strategy: 'jwt', secret: TEST_SECRET } })

    const result = await auth.refresh('valid-raw-token')

    expect(result.token).toBeTruthy()
    expect(result.refreshToken).toBeTruthy()
    expect(result.refreshToken.length).toBe(64)
    expect(deleteToken).toHaveBeenCalledWith('rt-1')
    expect(createToken).toHaveBeenCalledWith(expect.objectContaining({ type: 'REFRESH' }))
  })

  it('fires onTokenRefresh callback', async () => {
    const validToken: Token = {
      id: 'rt-1',
      userId: 'user-1',
      type: 'REFRESH',
      token: 'hash',
      expiresAt: new Date(Date.now() + 60_000),
      createdAt: new Date(),
    }
    const onTokenRefresh = vi.fn()
    const db = makeMockDb({
      findToken: vi.fn().mockResolvedValue(validToken),
      findUserById: vi.fn().mockResolvedValue(makeUser({ id: 'user-1' })),
    })
    const auth = createAuth({
      db,
      session: { strategy: 'jwt', secret: TEST_SECRET },
      callbacks: { onTokenRefresh },
    })

    await auth.refresh('valid')
    expect(onTokenRefresh).toHaveBeenCalledOnce()
    expect(onTokenRefresh.mock.calls[0]![0]).not.toHaveProperty('passwordHash')
  })
})

describe('createAuth().revoke / revokeAll', () => {
  it('revoke deletes the matching REFRESH token', async () => {
    const tokenRecord: Token = {
      id: 'rt-1',
      userId: 'user-1',
      type: 'REFRESH',
      token: 'hash',
      expiresAt: new Date(Date.now() + 60_000),
      createdAt: new Date(),
    }
    const deleteToken = vi.fn().mockResolvedValue(undefined)
    const db = makeMockDb({
      findToken: vi.fn().mockResolvedValue(tokenRecord),
      deleteToken,
    })
    const auth = createAuth({ db, session: { strategy: 'jwt', secret: TEST_SECRET } })

    await auth.revoke('raw')
    expect(deleteToken).toHaveBeenCalledWith('rt-1')
  })

  it('revoke is idempotent when token does not exist', async () => {
    const deleteToken = vi.fn().mockResolvedValue(undefined)
    const db = makeMockDb({
      findToken: vi.fn().mockResolvedValue(null),
      deleteToken,
    })
    const auth = createAuth({ db, session: { strategy: 'jwt', secret: TEST_SECRET } })

    await expect(auth.revoke('does-not-exist')).resolves.toBeUndefined()
    expect(deleteToken).not.toHaveBeenCalled()
  })

  it('revoke ignores empty token without DB call', async () => {
    const db = makeMockDb()
    const auth = createAuth({ db, session: { strategy: 'jwt', secret: TEST_SECRET } })
    await auth.revoke('')
    expect(db.findToken).not.toHaveBeenCalled()
  })

  it('revokeAll calls deleteTokensByUserAndType with REFRESH', async () => {
    const deleteTokensByUserAndType = vi.fn().mockResolvedValue(undefined)
    const db = makeMockDb({ deleteTokensByUserAndType })
    const auth = createAuth({ db, session: { strategy: 'jwt', secret: TEST_SECRET } })

    await auth.revokeAll('user-1')
    expect(deleteTokensByUserAndType).toHaveBeenCalledWith('user-1', 'REFRESH')
  })
})

// ---- 0.10: onFailedLogin callback ----

describe('callbacks.onFailedLogin', () => {
  it('fires with INVALID_CREDENTIALS when user not found', async () => {
    const onFailedLogin = vi.fn()
    const db = makeMockDb({ findUserByEmail: vi.fn().mockResolvedValue(null) })
    const auth = createAuth({
      db,
      session: { strategy: 'jwt', secret: TEST_SECRET },
      callbacks: { onFailedLogin },
    })
    await expect(
      auth.login({ email: 'nobody@example.com', password: 'password123' }),
    ).rejects.toMatchObject({ code: 'INVALID_CREDENTIALS' })
    expect(onFailedLogin).toHaveBeenCalledWith('nobody@example.com', 'INVALID_CREDENTIALS')
  })

  it('fires with INVALID_CREDENTIALS when password is wrong', async () => {
    const { hashPassword } = await import('../utils/password.js')
    const realHash = await hashPassword('correctpassword')
    const onFailedLogin = vi.fn()
    const db = makeMockDb({
      findUserByEmail: vi.fn().mockResolvedValue(makeUser({ passwordHash: realHash, emailVerified: true })),
    })
    const auth = createAuth({
      db,
      session: { strategy: 'jwt', secret: TEST_SECRET },
      callbacks: { onFailedLogin },
    })
    await expect(
      auth.login({ email: 'test@example.com', password: 'wrong' }),
    ).rejects.toMatchObject({ code: 'INVALID_CREDENTIALS' })
    expect(onFailedLogin).toHaveBeenCalledWith('test@example.com', 'INVALID_CREDENTIALS')
  })

  it('fires with EMAIL_NOT_VERIFIED when email verification is required', async () => {
    const { hashPassword } = await import('../utils/password.js')
    const realHash = await hashPassword('password123')
    const onFailedLogin = vi.fn()
    const db = makeMockDb({
      findUserByEmail: vi.fn().mockResolvedValue(makeUser({ passwordHash: realHash, emailVerified: false })),
    })
    const auth = createAuth({
      db,
      session: { strategy: 'jwt', secret: TEST_SECRET },
      features: ['emailVerification'],
      callbacks: { onFailedLogin },
    })
    await expect(
      auth.login({ email: 'test@example.com', password: 'password123' }),
    ).rejects.toMatchObject({ code: 'EMAIL_NOT_VERIFIED' })
    expect(onFailedLogin).toHaveBeenCalledWith('test@example.com', 'EMAIL_NOT_VERIFIED')
  })
})

// ---- 0.10: generateCsrfToken ----

describe('generateCsrfToken', () => {
  it('returns a 64-char hex string distinct across calls', async () => {
    const { generateCsrfToken } = await import('../utils/token.js')
    const a = generateCsrfToken()
    const b = generateCsrfToken()
    expect(a).toMatch(/^[a-f0-9]{64}$/)
    expect(b).toMatch(/^[a-f0-9]{64}$/)
    expect(a).not.toBe(b)
  })
})

// ---- 0.11: OAuth ----

const REDIRECT_URI = 'https://app.example/auth/oauth/google/callback'

describe('createAuth().oauthStart', () => {
  it('throws OAUTH_PROVIDER_UNKNOWN when no provider is registered under that id', async () => {
    const auth = createAuth({
      db: makeMockDb(),
      session: { strategy: 'jwt', secret: TEST_SECRET },
    })
    await expect(auth.oauthStart('google', REDIRECT_URI)).rejects.toMatchObject({
      statusCode: 400,
      code: 'OAUTH_PROVIDER_UNKNOWN',
    })
  })

  it('returns the provider authorization URL and an opaque state', async () => {
    const provider = makeFakeProvider()
    const auth = createAuth({
      db: makeMockDb(),
      session: { strategy: 'jwt', secret: TEST_SECRET },
      oauth: { google: provider },
    })
    const { authorizationUrl, state } = await auth.oauthStart('google', REDIRECT_URI)
    expect(authorizationUrl).toContain('https://provider.example/authorize')
    expect(authorizationUrl).toContain(`state=${encodeURIComponent(state)}`)
    expect(state).toMatch(/\./) // base64url(payload) + '.' + base64url(sig)
  })
})

describe('createAuth().oauthCallback', () => {
  it('rejects an unsigned/forged state (invalid HMAC)', async () => {
    const provider = makeFakeProvider()
    const auth = createAuth({
      db: makeMockDb(),
      session: { strategy: 'jwt', secret: TEST_SECRET },
      oauth: { google: provider },
    })
    await expect(
      auth.oauthCallback('google', { code: 'x', state: 'forged.signature', redirectUri: REDIRECT_URI }),
    ).rejects.toMatchObject({ statusCode: 401, code: 'INVALID_TOKEN' })
  })

  it('rejects a state whose redirectUri does not match the callback URI', async () => {
    const provider = makeFakeProvider()
    const auth = createAuth({
      db: makeMockDb(),
      session: { strategy: 'jwt', secret: TEST_SECRET },
      oauth: { google: provider },
    })
    const { state } = await auth.oauthStart('google', REDIRECT_URI)
    await expect(
      auth.oauthCallback('google', { code: 'x', state, redirectUri: 'https://evil.example/cb' }),
    ).rejects.toMatchObject({ statusCode: 401 })
  })

  it('creates a brand-new user when no OAuthAccount and no local user exists', async () => {
    const provider = makeFakeProvider()
    const db = makeMockDb({
      findOAuthAccount: vi.fn().mockResolvedValue(null),
      findUserByEmail: vi.fn().mockResolvedValue(null),
      createUser: vi.fn().mockResolvedValue(
        makeUser({ id: 'user-new', email: 'remote@example.com', emailVerified: false }),
      ),
      updateUser: vi.fn().mockImplementation(async (id, data) => ({
        ...makeUser({ id, email: 'remote@example.com' }),
        ...data,
      })),
    })
    const onSignUp = vi.fn()
    const auth = createAuth({
      db,
      session: { strategy: 'jwt', secret: TEST_SECRET },
      oauth: { google: provider },
      callbacks: { onSignUp },
    })

    const { state } = await auth.oauthStart('google', REDIRECT_URI)
    const result = await auth.oauthCallback('google', { code: 'abc', state, redirectUri: REDIRECT_URI })

    expect(result.isNewUser).toBe(true)
    expect(result.user.email).toBe('remote@example.com')
    expect(result.token).toBeTruthy()
    expect(result.refreshToken).toBeTruthy()
    expect(db.createUser).toHaveBeenCalledOnce()
    expect(db.createOAuthAccount).toHaveBeenCalledOnce()
    expect(onSignUp).toHaveBeenCalledOnce()
  })

  it('links to an existing local user with verified email', async () => {
    const provider = makeFakeProvider()
    const existing = makeUser({
      id: 'user-existing',
      email: 'remote@example.com',
      emailVerified: true,
    })
    const db = makeMockDb({
      findOAuthAccount: vi.fn().mockResolvedValue(null),
      findUserByEmail: vi.fn().mockResolvedValue(existing),
    })
    const onSignIn = vi.fn()
    const onSignUp = vi.fn()
    const auth = createAuth({
      db,
      session: { strategy: 'jwt', secret: TEST_SECRET },
      oauth: { google: provider },
      callbacks: { onSignIn, onSignUp },
    })

    const { state } = await auth.oauthStart('google', REDIRECT_URI)
    const result = await auth.oauthCallback('google', { code: 'abc', state, redirectUri: REDIRECT_URI })

    expect(result.isNewUser).toBe(false)
    expect(result.user.id).toBe('user-existing')
    expect(db.createUser).not.toHaveBeenCalled()
    expect(db.createOAuthAccount).toHaveBeenCalledOnce()
    expect(onSignIn).toHaveBeenCalledOnce()
    expect(onSignUp).not.toHaveBeenCalled()
  })

  it('refuses to link an existing local user when provider has not verified the email', async () => {
    const provider = makeFakeProvider({
      getUserInfo: async () => ({ id: 'remote-1', email: 'existing@example.com', emailVerified: false }),
    })
    const db = makeMockDb({
      findOAuthAccount: vi.fn().mockResolvedValue(null),
      findUserByEmail: vi.fn().mockResolvedValue(makeUser({ email: 'existing@example.com' })),
    })
    const auth = createAuth({
      db,
      session: { strategy: 'jwt', secret: TEST_SECRET },
      oauth: { google: provider },
    })

    const { state } = await auth.oauthStart('google', REDIRECT_URI)
    await expect(
      auth.oauthCallback('google', { code: 'abc', state, redirectUri: REDIRECT_URI }),
    ).rejects.toMatchObject({ statusCode: 409, code: 'EMAIL_NOT_VERIFIED_BY_PROVIDER' })
    expect(db.createOAuthAccount).not.toHaveBeenCalled()
  })

  it('loads the linked user when an OAuthAccount already exists, no new account row created', async () => {
    const provider = makeFakeProvider()
    const existing = makeUser({ id: 'user-linked', email: 'remote@example.com', emailVerified: true })
    const db = makeMockDb({
      findOAuthAccount: vi.fn().mockResolvedValue({
        id: 'oauth-existing',
        userId: 'user-linked',
        provider: 'google',
        providerAccountId: 'remote-1',
        accessToken: 'old-access',
        refreshToken: 'old-refresh',
        expiresAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      }),
      findUserById: vi.fn().mockResolvedValue(existing),
    })
    const auth = createAuth({
      db,
      session: { strategy: 'jwt', secret: TEST_SECRET },
      oauth: { google: provider },
    })

    const { state } = await auth.oauthStart('google', REDIRECT_URI)
    const result = await auth.oauthCallback('google', { code: 'abc', state, redirectUri: REDIRECT_URI })

    expect(result.isNewUser).toBe(false)
    expect(result.user.id).toBe('user-linked')
    expect(db.createOAuthAccount).not.toHaveBeenCalled()
    expect(db.updateOAuthAccount).toHaveBeenCalledOnce()
  })

  it('wraps provider exchangeCode failures as OAUTH_EXCHANGE_FAILED (502)', async () => {
    const provider = makeFakeProvider({
      exchangeCode: async () => {
        throw new Error('upstream 500')
      },
    })
    const auth = createAuth({
      db: makeMockDb(),
      session: { strategy: 'jwt', secret: TEST_SECRET },
      oauth: { google: provider },
    })
    const { state } = await auth.oauthStart('google', REDIRECT_URI)
    await expect(
      auth.oauthCallback('google', { code: 'x', state, redirectUri: REDIRECT_URI }),
    ).rejects.toMatchObject({ statusCode: 502, code: 'OAUTH_EXCHANGE_FAILED' })
  })

  it('wraps provider getUserInfo failures as OAUTH_USERINFO_FAILED (502)', async () => {
    const provider = makeFakeProvider({
      getUserInfo: async () => {
        throw new Error('userinfo 500')
      },
    })
    const auth = createAuth({
      db: makeMockDb(),
      session: { strategy: 'jwt', secret: TEST_SECRET },
      oauth: { google: provider },
    })
    const { state } = await auth.oauthStart('google', REDIRECT_URI)
    await expect(
      auth.oauthCallback('google', { code: 'x', state, redirectUri: REDIRECT_URI }),
    ).rejects.toMatchObject({ statusCode: 502, code: 'OAUTH_USERINFO_FAILED' })
  })
})
