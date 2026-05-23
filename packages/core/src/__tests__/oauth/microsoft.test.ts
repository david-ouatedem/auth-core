import { describe, it, expect, vi, afterEach } from 'vitest'
import { createMicrosoftProvider } from '../../oauth/microsoft.js'

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

/** Build a minimal `header.payload.signature` JWS with the given claims (signature not verified). */
function buildIdToken(claims: Record<string, unknown>): string {
  const header = Buffer.from(JSON.stringify({ alg: 'RS256', typ: 'JWT' })).toString('base64url')
  const payload = Buffer.from(JSON.stringify(claims)).toString('base64url')
  return `${header}.${payload}.signature-not-verified`
}

const CFG = { clientId: 'ms-id', clientSecret: 'ms-secret' }

afterEach(() => vi.restoreAllMocks())

describe('createMicrosoftProvider', () => {
  describe('authorize URL', () => {
    it('uses the common tenant by default', () => {
      const provider = createMicrosoftProvider(CFG)
      const url = provider.authorize({
        state: 's',
        codeChallenge: 'c',
        redirectUri: 'https://app/cb',
      })
      expect(url).toContain('https://login.microsoftonline.com/common/oauth2/v2.0/authorize')
    })

    it('respects a custom tenant id', () => {
      const provider = createMicrosoftProvider({ ...CFG, tenant: 'acme.onmicrosoft.com' })
      const url = provider.authorize({
        state: 's',
        codeChallenge: 'c',
        redirectUri: 'https://app/cb',
      })
      expect(url).toContain('https://login.microsoftonline.com/acme.onmicrosoft.com/oauth2/v2.0/authorize')
    })

    it('includes response_type=code, response_mode=query, scope, state, PKCE', () => {
      const provider = createMicrosoftProvider(CFG)
      const url = new URL(
        provider.authorize({ state: 's', codeChallenge: 'c', redirectUri: 'https://app/cb' }),
      )
      expect(url.searchParams.get('response_type')).toBe('code')
      expect(url.searchParams.get('response_mode')).toBe('query')
      expect(url.searchParams.get('scope')).toBe('openid profile email')
      expect(url.searchParams.get('state')).toBe('s')
      expect(url.searchParams.get('code_challenge')).toBe('c')
      expect(url.searchParams.get('code_challenge_method')).toBe('S256')
    })
  })

  describe('exchangeCode', () => {
    it('returns access + refresh + idToken + expires when present', async () => {
      vi.stubGlobal(
        'fetch',
        mockFetch({
          '/oauth2/v2.0/token': {
            body: {
              access_token: 'ms-access',
              refresh_token: 'ms-refresh',
              expires_in: 3600,
              id_token: buildIdToken({ sub: 'abc' }),
            },
          },
        }),
      )
      const provider = createMicrosoftProvider(CFG)
      const tokens = await provider.exchangeCode({
        code: 'c',
        codeVerifier: 'p',
        redirectUri: 'https://app/cb',
      })
      expect(tokens.accessToken).toBe('ms-access')
      expect(tokens.refreshToken).toBe('ms-refresh')
      expect(tokens.expiresIn).toBe(3600)
      expect(tokens.idToken).toBeTruthy()
    })

    it('throws on non-2xx', async () => {
      vi.stubGlobal(
        'fetch',
        mockFetch({ '/oauth2/v2.0/token': { status: 400, text: 'invalid_grant' } }),
      )
      const provider = createMicrosoftProvider(CFG)
      await expect(
        provider.exchangeCode({ code: 'c', codeVerifier: 'p', redirectUri: 'https://app/cb' }),
      ).rejects.toThrow(/Microsoft token exchange failed/)
    })
  })

  describe('getUserInfo', () => {
    it('reads sub, email, name from id_token claims without hitting Graph', async () => {
      // No fetch mock — verifies we don't fall back to Graph when id_token has email.
      vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('should not be called')))
      const provider = createMicrosoftProvider(CFG)
      const info = await provider.getUserInfo(
        'access',
        buildIdToken({ sub: 'user-1', email: 'a@b.com', name: 'Alice' }),
      )
      expect(info.id).toBe('user-1')
      expect(info.email).toBe('a@b.com')
      expect(info.emailVerified).toBe(true)
      expect(info.name).toBe('Alice')
    })

    it('falls back to preferred_username if email claim is missing', async () => {
      const provider = createMicrosoftProvider(CFG)
      const info = await provider.getUserInfo(
        'access',
        buildIdToken({ sub: 'u', preferred_username: 'upn@tenant.com', name: 'Bob' }),
      )
      expect(info.email).toBe('upn@tenant.com')
    })

    it('falls back to /me on Microsoft Graph if id_token absent', async () => {
      vi.stubGlobal(
        'fetch',
        mockFetch({
          '/v1.0/me': {
            body: { id: 'graph-1', mail: 'work@tenant.com', displayName: 'Carol' },
          },
        }),
      )
      const provider = createMicrosoftProvider(CFG)
      const info = await provider.getUserInfo('access')
      expect(info.id).toBe('graph-1')
      expect(info.email).toBe('work@tenant.com')
      expect(info.name).toBe('Carol')
    })

    it('uses userPrincipalName when /me.mail is null', async () => {
      vi.stubGlobal(
        'fetch',
        mockFetch({
          '/v1.0/me': {
            body: { id: 'graph-2', mail: null, userPrincipalName: 'fallback@tenant.com' },
          },
        }),
      )
      const provider = createMicrosoftProvider(CFG)
      const info = await provider.getUserInfo('access')
      expect(info.email).toBe('fallback@tenant.com')
    })

    it('throws when Graph /me fails', async () => {
      vi.stubGlobal('fetch', mockFetch({ '/v1.0/me': { status: 401, text: 'unauthorized' } }))
      const provider = createMicrosoftProvider(CFG)
      await expect(provider.getUserInfo('access')).rejects.toThrow(/Microsoft Graph \/me failed/)
    })
  })
})
