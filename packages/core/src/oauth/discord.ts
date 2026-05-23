import type { OAuthProvider } from '@authcore/types'

export interface DiscordProviderConfig {
  clientId: string
  clientSecret: string
  /**
   * Defaults to `['identify', 'email']`. `identify` returns the basic profile;
   * `email` is required to get the user's email + verification status.
   */
  scopes?: string[]
}

const DEFAULT_SCOPES = ['identify', 'email']

/**
 * Create a Discord OAuth 2.0 provider.
 *
 * ```ts
 * import { createDiscordProvider } from '@authcore/core'
 * const discord = createDiscordProvider({
 *   clientId: process.env.DISCORD_CLIENT_ID!,
 *   clientSecret: process.env.DISCORD_CLIENT_SECRET!,
 * })
 * createAuth({ ..., oauth: { discord } })
 * ```
 *
 * Notes:
 * - Discord exposes `verified` on the user object — AuthCore threads that
 *   straight through to `emailVerified`. Unverified Discord users will hit
 *   the standard AuthCore "EMAIL_NOT_VERIFIED_BY_PROVIDER" gate when linking
 *   to an existing local account.
 * - User avatar URLs are constructed from the user's `id` + `avatar` hash
 *   (https://discord.com/developers/docs/reference#image-formatting).
 */
export function createDiscordProvider(config: DiscordProviderConfig): OAuthProvider {
  const scopes = config.scopes ?? DEFAULT_SCOPES

  return {
    id: 'discord',
    scopes,

    authorize: ({ state, codeChallenge, redirectUri }) => {
      const url = new URL('https://discord.com/oauth2/authorize')
      url.searchParams.set('client_id', config.clientId)
      url.searchParams.set('redirect_uri', redirectUri)
      url.searchParams.set('response_type', 'code')
      url.searchParams.set('scope', scopes.join(' '))
      url.searchParams.set('state', state)
      url.searchParams.set('code_challenge', codeChallenge)
      url.searchParams.set('code_challenge_method', 'S256')
      // `prompt=consent` ensures Discord re-asks (vs. silently re-using a prior approval).
      url.searchParams.set('prompt', 'consent')
      return url.toString()
    },

    exchangeCode: async ({ code, codeVerifier, redirectUri }) => {
      const res = await fetch('https://discord.com/api/oauth2/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          code,
          client_id: config.clientId,
          client_secret: config.clientSecret,
          redirect_uri: redirectUri,
          grant_type: 'authorization_code',
          code_verifier: codeVerifier,
        }),
      })
      if (!res.ok) {
        throw new Error(`Discord token exchange failed (${res.status}): ${await res.text()}`)
      }
      const body = (await res.json()) as {
        access_token: string
        refresh_token?: string
        expires_in?: number
        token_type?: string
        scope?: string
      }
      return {
        accessToken: body.access_token,
        ...(body.refresh_token !== undefined ? { refreshToken: body.refresh_token } : {}),
        ...(body.expires_in !== undefined ? { expiresIn: body.expires_in } : {}),
      }
    },

    getUserInfo: async (accessToken) => {
      const res = await fetch('https://discord.com/api/users/@me', {
        headers: { Authorization: `Bearer ${accessToken}` },
      })
      if (!res.ok) {
        throw new Error(`Discord /users/@me failed (${res.status}): ${await res.text()}`)
      }
      const me = (await res.json()) as {
        id: string
        username: string
        global_name?: string | null
        email?: string | null
        verified?: boolean
        avatar?: string | null
      }
      if (!me.email) {
        throw new Error('Discord account has no email (was the `email` scope requested?)')
      }
      return {
        id: me.id,
        email: me.email,
        emailVerified: me.verified === true,
        ...(me.global_name || me.username ? { name: me.global_name ?? me.username } : {}),
        ...(me.avatar
          ? { picture: `https://cdn.discordapp.com/avatars/${me.id}/${me.avatar}.png` }
          : {}),
      }
    },
  }
}
