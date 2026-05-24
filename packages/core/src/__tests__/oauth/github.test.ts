import { describe, it, expect, vi, afterEach } from 'vitest'
import { createGithubProvider } from '../../oauth/github.js'

/** Build a `fetch` mock that returns different responses keyed by URL substring. */
function mockFetch(routes: Record<string, { status?: number; body?: unknown; text?: string }>) {
  return vi.fn(async (input: string | URL | Request) => {
    const url = typeof input === 'string' ? input : input.toString()
    const match = Object.keys(routes).find((k) => url.includes(k))
    if (!match) {
      return new Response(JSON.stringify({ error: 'unmocked' }), { status: 500 })
    }
    const { status = 200, body, text } = routes[match]!
    if (text !== undefined) return new Response(text, { status })
    return new Response(JSON.stringify(body ?? {}), {
      status,
      headers: { 'Content-Type': 'application/json' },
    })
  })
}

const PROVIDER_CONFIG = { clientId: 'gh-id', clientSecret: 'gh-secret' }

afterEach(() => {
  vi.restoreAllMocks()
})

describe('createGithubProvider', () => {
  describe('authorize URL', () => {
    it('includes client_id, redirect_uri, scope, state, and PKCE params', () => {
      const provider = createGithubProvider(PROVIDER_CONFIG)
      const url = new URL(
        provider.authorize({
          state: 'nonce',
          codeChallenge: 'chal',
          redirectUri: 'https://app/cb',
        }),
      )
      expect(url.origin).toBe('https://github.com')
      expect(url.pathname).toBe('/login/oauth/authorize')
      expect(url.searchParams.get('client_id')).toBe('gh-id')
      expect(url.searchParams.get('redirect_uri')).toBe('https://app/cb')
      expect(url.searchParams.get('scope')).toBe('read:user user:email')
      expect(url.searchParams.get('state')).toBe('nonce')
      expect(url.searchParams.get('code_challenge')).toBe('chal')
      expect(url.searchParams.get('code_challenge_method')).toBe('S256')
    })

    it('respects custom scopes', () => {
      const provider = createGithubProvider({ ...PROVIDER_CONFIG, scopes: ['repo'] })
      const url = new URL(
        provider.authorize({ state: 's', codeChallenge: 'c', redirectUri: 'https://app/cb' }),
      )
      expect(url.searchParams.get('scope')).toBe('repo')
    })

    it('uses GitHub Enterprise base URL when configured', () => {
      const provider = createGithubProvider({
        ...PROVIDER_CONFIG,
        enterpriseBaseUrl: 'https://ghe.example.com',
      })
      const url = provider.authorize({
        state: 's',
        codeChallenge: 'c',
        redirectUri: 'https://app/cb',
      })
      expect(url).toContain('https://ghe.example.com/login/oauth/authorize')
    })
  })

  describe('exchangeCode', () => {
    it('returns accessToken (+ optional refreshToken, expiresIn) on success', async () => {
      vi.stubGlobal(
        'fetch',
        mockFetch({
          '/login/oauth/access_token': {
            body: {
              access_token: 'access-1',
              refresh_token: 'refresh-1',
              expires_in: 3600,
              token_type: 'bearer',
              scope: 'read:user user:email',
            },
          },
        }),
      )
      const provider = createGithubProvider(PROVIDER_CONFIG)
      const tokens = await provider.exchangeCode({
        code: 'auth-code',
        codeVerifier: 'pkce',
        redirectUri: 'https://app/cb',
      })
      expect(tokens.accessToken).toBe('access-1')
      expect(tokens.refreshToken).toBe('refresh-1')
      expect(tokens.expiresIn).toBe(3600)
    })

    it('throws when GitHub returns an error body', async () => {
      vi.stubGlobal(
        'fetch',
        mockFetch({
          '/login/oauth/access_token': {
            body: { error: 'bad_verification_code', error_description: 'expired' },
          },
        }),
      )
      const provider = createGithubProvider(PROVIDER_CONFIG)
      await expect(
        provider.exchangeCode({ code: 'x', codeVerifier: 'p', redirectUri: 'https://app/cb' }),
      ).rejects.toThrow(/bad_verification_code|expired/)
    })

    it('throws on non-2xx response', async () => {
      vi.stubGlobal(
        'fetch',
        mockFetch({
          '/login/oauth/access_token': { status: 500, text: 'server boom' },
        }),
      )
      const provider = createGithubProvider(PROVIDER_CONFIG)
      await expect(
        provider.exchangeCode({ code: 'x', codeVerifier: 'p', redirectUri: 'https://app/cb' }),
      ).rejects.toThrow(/GitHub token exchange failed.*500/)
    })
  })

  describe('getUserInfo', () => {
    it('returns the verified primary email + profile fields', async () => {
      vi.stubGlobal(
        'fetch',
        mockFetch({
          '/user/emails': {
            body: [
              { email: 'secondary@example.com', primary: false, verified: true, visibility: null },
              { email: 'primary@example.com', primary: true, verified: true, visibility: 'private' },
            ],
          },
          '/user': {
            body: {
              id: 12345,
              login: 'octocat',
              name: 'The Octocat',
              avatar_url: 'https://example/avatar.png',
              email: null,
            },
          },
        }),
      )
      const provider = createGithubProvider(PROVIDER_CONFIG)
      const info = await provider.getUserInfo('access-1')
      expect(info.id).toBe('12345')
      expect(info.email).toBe('primary@example.com')
      expect(info.emailVerified).toBe(true)
      expect(info.name).toBe('The Octocat')
      expect(info.picture).toBe('https://example/avatar.png')
    })

    it('falls back to user.login when name is null', async () => {
      vi.stubGlobal(
        'fetch',
        mockFetch({
          '/user/emails': {
            body: [{ email: 'me@example.com', primary: true, verified: true, visibility: null }],
          },
          '/user': { body: { id: 1, login: 'octocat', name: null } },
        }),
      )
      const provider = createGithubProvider(PROVIDER_CONFIG)
      const info = await provider.getUserInfo('access-1')
      expect(info.name).toBe('octocat')
    })

    it('throws when no verified email exists', async () => {
      vi.stubGlobal(
        'fetch',
        mockFetch({
          '/user/emails': {
            body: [{ email: 'unverified@example.com', primary: true, verified: false, visibility: null }],
          },
          '/user': { body: { id: 1, login: 'octocat' } },
        }),
      )
      const provider = createGithubProvider(PROVIDER_CONFIG)
      await expect(provider.getUserInfo('access-1')).rejects.toThrow(/no verified email/)
    })

    it('throws on /user 401', async () => {
      vi.stubGlobal(
        'fetch',
        mockFetch({
          '/user/emails': { body: [] },
          '/user': { status: 401, text: 'unauthorized' },
        }),
      )
      const provider = createGithubProvider(PROVIDER_CONFIG)
      await expect(provider.getUserInfo('access-1')).rejects.toThrow(/401/)
    })
  })
})
