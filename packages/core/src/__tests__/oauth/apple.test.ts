import { describe, it, expect, vi, afterEach, beforeAll } from 'vitest'
import { generateKeyPairSync, createVerify } from 'node:crypto'
import { createAppleProvider, generateAppleClientSecret } from '../../oauth/apple.js'

function mockFetch(routes: Record<string, { status?: number; body?: unknown; text?: string }>) {
  return vi.fn(async (input: string | URL | Request) => {
    const url = typeof input === 'string' ? input : input.toString()
    const match = Object.keys(routes).find((k) => url.includes(k))
    if (!match) return new Response(JSON.stringify({ error: 'unmocked' }), { status: 500 })
    const { status = 200, body, text } = routes[match]!
    if (text !== undefined) return new Response(text, { status })
    return new Response(JSON.stringify(body ?? {}), {
      status,
      headers: { 'Content-Type': 'application/json' },
    })
  })
}

function buildIdToken(claims: Record<string, unknown>): string {
  const header = Buffer.from(JSON.stringify({ alg: 'RS256', typ: 'JWT' })).toString('base64url')
  const payload = Buffer.from(JSON.stringify(claims)).toString('base64url')
  return `${header}.${payload}.signature-not-verified`
}

/** Generate an ephemeral P-256 keypair for signing/verification in tests. */
let TEST_PRIVATE_KEY: string
let TEST_PUBLIC_KEY: string

beforeAll(() => {
  const { privateKey, publicKey } = generateKeyPairSync('ec', {
    namedCurve: 'P-256',
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  })
  TEST_PRIVATE_KEY = privateKey
  TEST_PUBLIC_KEY = publicKey
})

const APPLE_CFG = () => ({
  clientId: 'com.example.app.service',
  teamId: 'TEAM123456',
  keyId: 'KEY9876543',
  privateKey: TEST_PRIVATE_KEY,
})

afterEach(() => vi.restoreAllMocks())

describe('generateAppleClientSecret', () => {
  it('produces a JWS that verifies with the matching public key (ES256, IEEE P1363 sig)', () => {
    const jwt = generateAppleClientSecret({
      teamId: 'TEAM123456',
      keyId: 'KEY9876543',
      clientId: 'com.example.app.service',
      privateKey: TEST_PRIVATE_KEY,
      ttlSeconds: 300,
    })
    const parts = jwt.split('.')
    expect(parts).toHaveLength(3)

    const [headerB64, payloadB64, sigB64] = parts as [string, string, string]
    const header = JSON.parse(Buffer.from(headerB64, 'base64url').toString())
    const payload = JSON.parse(Buffer.from(payloadB64, 'base64url').toString())
    expect(header.alg).toBe('ES256')
    expect(header.kid).toBe('KEY9876543')
    expect(header.typ).toBe('JWT')
    expect(payload.iss).toBe('TEAM123456')
    expect(payload.sub).toBe('com.example.app.service')
    expect(payload.aud).toBe('https://appleid.apple.com')
    expect(payload.exp - payload.iat).toBe(300)

    const ok = createVerify('SHA256')
      .update(`${headerB64}.${payloadB64}`)
      .verify(
        { key: TEST_PUBLIC_KEY, dsaEncoding: 'ieee-p1363' },
        Buffer.from(sigB64, 'base64url'),
      )
    expect(ok).toBe(true)
  })

  it('defaults TTL to 600 seconds when not specified', () => {
    const jwt = generateAppleClientSecret({
      teamId: 'T', keyId: 'K', clientId: 'C', privateKey: TEST_PRIVATE_KEY,
    })
    const payload = JSON.parse(Buffer.from(jwt.split('.')[1]!, 'base64url').toString())
    expect(payload.exp - payload.iat).toBe(600)
  })
})

describe('createAppleProvider', () => {
  describe('authorize URL', () => {
    it('points at https://appleid.apple.com/auth/authorize with response_mode=query', () => {
      const provider = createAppleProvider(APPLE_CFG())
      const url = new URL(
        provider.authorize({ state: 's', codeChallenge: 'c', redirectUri: 'https://app/cb' }),
      )
      expect(url.origin).toBe('https://appleid.apple.com')
      expect(url.pathname).toBe('/auth/authorize')
      expect(url.searchParams.get('response_type')).toBe('code')
      expect(url.searchParams.get('response_mode')).toBe('query')
      expect(url.searchParams.get('scope')).toBe('name email')
      expect(url.searchParams.get('code_challenge_method')).toBe('S256')
    })
  })

  describe('exchangeCode', () => {
    it('mints a fresh client secret and posts to /auth/token', async () => {
      let capturedBody: URLSearchParams | undefined
      const fetchMock = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
        const url = typeof input === 'string' ? input : input.toString()
        if (url.includes('/auth/token')) {
          capturedBody = new URLSearchParams((init?.body as string) ?? '')
          return new Response(
            JSON.stringify({
              access_token: 'apple-access',
              refresh_token: 'apple-refresh',
              expires_in: 3600,
              id_token: buildIdToken({
                sub: 'user-1',
                email: 'a@b.com',
                email_verified: 'true',
              }),
            }),
            { status: 200, headers: { 'Content-Type': 'application/json' } },
          )
        }
        return new Response('{}', { status: 500 })
      })
      vi.stubGlobal('fetch', fetchMock)

      const provider = createAppleProvider(APPLE_CFG())
      const tokens = await provider.exchangeCode({
        code: 'c',
        codeVerifier: 'p',
        redirectUri: 'https://app/cb',
      })
      expect(tokens.accessToken).toBe('apple-access')
      expect(tokens.refreshToken).toBe('apple-refresh')
      expect(tokens.idToken).toBeTruthy()

      // Client secret was a freshly generated JWS, not a static string.
      expect(capturedBody).toBeDefined()
      const clientSecret = capturedBody!.get('client_secret')!
      expect(clientSecret.split('.')).toHaveLength(3)
      const header = JSON.parse(Buffer.from(clientSecret.split('.')[0]!, 'base64url').toString())
      expect(header.alg).toBe('ES256')
      expect(header.kid).toBe('KEY9876543')
    })

    it('throws on non-2xx', async () => {
      vi.stubGlobal(
        'fetch',
        mockFetch({ '/auth/token': { status: 400, text: '{"error":"invalid_grant"}' } }),
      )
      const provider = createAppleProvider(APPLE_CFG())
      await expect(
        provider.exchangeCode({ code: 'c', codeVerifier: 'p', redirectUri: 'https://app/cb' }),
      ).rejects.toThrow(/Apple token exchange failed.*400/)
    })
  })

  describe('getUserInfo', () => {
    it('reads sub + email from id_token, normalizes string "true" email_verified', async () => {
      const provider = createAppleProvider(APPLE_CFG())
      const info = await provider.getUserInfo(
        'access',
        buildIdToken({
          sub: '001234.abc',
          email: 'private@privaterelay.appleid.com',
          email_verified: 'true',
          is_private_email: 'true',
        }),
      )
      expect(info.id).toBe('001234.abc')
      expect(info.email).toBe('private@privaterelay.appleid.com')
      expect(info.emailVerified).toBe(true)
    })

    it('also accepts boolean email_verified', async () => {
      const provider = createAppleProvider(APPLE_CFG())
      const info = await provider.getUserInfo(
        'access',
        buildIdToken({ sub: 'x', email: 'a@b.com', email_verified: true }),
      )
      expect(info.emailVerified).toBe(true)
    })

    it('treats string "false" as not verified', async () => {
      const provider = createAppleProvider(APPLE_CFG())
      const info = await provider.getUserInfo(
        'access',
        buildIdToken({ sub: 'x', email: 'a@b.com', email_verified: 'false' }),
      )
      expect(info.emailVerified).toBe(false)
    })

    it('throws when id_token is missing entirely', async () => {
      const provider = createAppleProvider(APPLE_CFG())
      await expect(provider.getUserInfo('access')).rejects.toThrow(/id_token missing/)
    })

    it('throws when required claims are absent', async () => {
      const provider = createAppleProvider(APPLE_CFG())
      await expect(
        provider.getUserInfo('access', buildIdToken({ sub: 'only-sub' })),
      ).rejects.toThrow(/missing required claims/)
    })
  })
})
