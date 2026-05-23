import { describe, it, expect, vi, afterEach } from 'vitest'
import { createDiscordProvider } from '../../oauth/discord.js'

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

const CFG = { clientId: 'disc-id', clientSecret: 'disc-secret' }

afterEach(() => vi.restoreAllMocks())

describe('createDiscordProvider', () => {
  describe('authorize URL', () => {
    it('includes client_id, redirect_uri, scope (identify + email by default), state, PKCE, prompt=consent', () => {
      const provider = createDiscordProvider(CFG)
      const url = new URL(
        provider.authorize({ state: 's', codeChallenge: 'c', redirectUri: 'https://app/cb' }),
      )
      expect(url.origin).toBe('https://discord.com')
      expect(url.pathname).toBe('/oauth2/authorize')
      expect(url.searchParams.get('response_type')).toBe('code')
      expect(url.searchParams.get('scope')).toBe('identify email')
      expect(url.searchParams.get('code_challenge_method')).toBe('S256')
      expect(url.searchParams.get('prompt')).toBe('consent')
    })

    it('respects custom scopes', () => {
      const provider = createDiscordProvider({ ...CFG, scopes: ['identify', 'email', 'guilds'] })
      const url = new URL(
        provider.authorize({ state: 's', codeChallenge: 'c', redirectUri: 'https://app/cb' }),
      )
      expect(url.searchParams.get('scope')).toBe('identify email guilds')
    })
  })

  describe('exchangeCode', () => {
    it('returns accessToken + refreshToken + expiresIn on success', async () => {
      vi.stubGlobal(
        'fetch',
        mockFetch({
          '/api/oauth2/token': {
            body: {
              access_token: 'disc-access',
              refresh_token: 'disc-refresh',
              expires_in: 604800,
              token_type: 'Bearer',
              scope: 'identify email',
            },
          },
        }),
      )
      const provider = createDiscordProvider(CFG)
      const tokens = await provider.exchangeCode({
        code: 'c',
        codeVerifier: 'p',
        redirectUri: 'https://app/cb',
      })
      expect(tokens.accessToken).toBe('disc-access')
      expect(tokens.refreshToken).toBe('disc-refresh')
      expect(tokens.expiresIn).toBe(604800)
    })

    it('throws on non-2xx', async () => {
      vi.stubGlobal(
        'fetch',
        mockFetch({ '/api/oauth2/token': { status: 400, text: '{"error":"invalid_grant"}' } }),
      )
      const provider = createDiscordProvider(CFG)
      await expect(
        provider.exchangeCode({ code: 'c', codeVerifier: 'p', redirectUri: 'https://app/cb' }),
      ).rejects.toThrow(/Discord token exchange failed.*400/)
    })
  })

  describe('getUserInfo', () => {
    it('returns id, email, emailVerified=true when Discord says verified, name, avatar URL', async () => {
      vi.stubGlobal(
        'fetch',
        mockFetch({
          '/users/@me': {
            body: {
              id: '1234567890',
              username: 'alice',
              global_name: 'Alice',
              email: 'alice@example.com',
              verified: true,
              avatar: 'a_b3c4d5e6f7',
            },
          },
        }),
      )
      const provider = createDiscordProvider(CFG)
      const info = await provider.getUserInfo('access')
      expect(info.id).toBe('1234567890')
      expect(info.email).toBe('alice@example.com')
      expect(info.emailVerified).toBe(true)
      expect(info.name).toBe('Alice')
      expect(info.picture).toBe('https://cdn.discordapp.com/avatars/1234567890/a_b3c4d5e6f7.png')
    })

    it('falls back to username when global_name is null', async () => {
      vi.stubGlobal(
        'fetch',
        mockFetch({
          '/users/@me': {
            body: {
              id: '999',
              username: 'oldschool',
              global_name: null,
              email: 'x@example.com',
              verified: true,
            },
          },
        }),
      )
      const provider = createDiscordProvider(CFG)
      const info = await provider.getUserInfo('access')
      expect(info.name).toBe('oldschool')
    })

    it('reports emailVerified=false when Discord verified is false', async () => {
      vi.stubGlobal(
        'fetch',
        mockFetch({
          '/users/@me': {
            body: { id: '1', username: 'u', email: 'unverified@example.com', verified: false },
          },
        }),
      )
      const provider = createDiscordProvider(CFG)
      const info = await provider.getUserInfo('access')
      expect(info.emailVerified).toBe(false)
    })

    it('throws when email is absent (missing email scope)', async () => {
      vi.stubGlobal(
        'fetch',
        mockFetch({
          '/users/@me': { body: { id: '1', username: 'u', verified: true } },
        }),
      )
      const provider = createDiscordProvider(CFG)
      await expect(provider.getUserInfo('access')).rejects.toThrow(/no email/)
    })

    it('throws on /users/@me 401', async () => {
      vi.stubGlobal('fetch', mockFetch({ '/users/@me': { status: 401, text: 'unauthorized' } }))
      const provider = createDiscordProvider(CFG)
      await expect(provider.getUserInfo('access')).rejects.toThrow(/401/)
    })
  })
})
