import type { OAuthProvider } from '@authcore/types'

export interface GithubProviderConfig {
  clientId: string
  clientSecret: string
  /**
   * Defaults to `['read:user', 'user:email']`. `user:email` is required to read
   * the user's verified primary email — GitHub does not include email in the
   * user object unless it has been marked public on the account.
   */
  scopes?: string[]
  /** Optional GitHub Enterprise base URL (e.g. `https://ghe.example.com`). */
  enterpriseBaseUrl?: string
}

const DEFAULT_SCOPES = ['read:user', 'user:email']

/**
 * Create a GitHub OAuth 2.0 provider.
 *
 * ```ts
 * import { createGithubProvider } from '@authcore/core'
 * const github = createGithubProvider({
 *   clientId: process.env.GITHUB_CLIENT_ID!,
 *   clientSecret: process.env.GITHUB_CLIENT_SECRET!,
 * })
 * createAuth({ ..., oauth: { github } })
 * ```
 *
 * Notes:
 * - GitHub does not natively support PKCE on the OAuth Apps endpoint, but it
 *   accepts the `code_challenge`/`code_challenge_method` query params without
 *   error. AuthCore sends them anyway; GitHub OAuth Apps ignore them while
 *   GitHub Apps verify them when configured to.
 * - The email returned is always the user's **verified primary** email. If
 *   they have no verified email, the provider throws — login is refused.
 */
export function createGithubProvider(config: GithubProviderConfig): OAuthProvider {
  const scopes = config.scopes ?? DEFAULT_SCOPES
  const oauthBase = config.enterpriseBaseUrl
    ? `${config.enterpriseBaseUrl}/login/oauth`
    : 'https://github.com/login/oauth'
  const apiBase = config.enterpriseBaseUrl
    ? `${config.enterpriseBaseUrl}/api/v3`
    : 'https://api.github.com'

  return {
    id: 'github',
    scopes,

    authorize: ({ state, codeChallenge, redirectUri }) => {
      const url = new URL(`${oauthBase}/authorize`)
      url.searchParams.set('client_id', config.clientId)
      url.searchParams.set('redirect_uri', redirectUri)
      url.searchParams.set('scope', scopes.join(' '))
      url.searchParams.set('state', state)
      url.searchParams.set('code_challenge', codeChallenge)
      url.searchParams.set('code_challenge_method', 'S256')
      return url.toString()
    },

    exchangeCode: async ({ code, codeVerifier, redirectUri }) => {
      const res = await fetch(`${oauthBase}/access_token`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          Accept: 'application/json',
        },
        body: new URLSearchParams({
          code,
          client_id: config.clientId,
          client_secret: config.clientSecret,
          redirect_uri: redirectUri,
          code_verifier: codeVerifier,
        }),
      })
      if (!res.ok) {
        throw new Error(`GitHub token exchange failed (${res.status}): ${await res.text()}`)
      }
      const body = (await res.json()) as {
        access_token?: string
        token_type?: string
        scope?: string
        refresh_token?: string
        expires_in?: number
        error?: string
        error_description?: string
      }
      if (body.error) {
        throw new Error(`GitHub token exchange failed: ${body.error_description ?? body.error}`)
      }
      if (!body.access_token) {
        throw new Error('GitHub token exchange returned no access_token')
      }
      return {
        accessToken: body.access_token,
        ...(body.refresh_token !== undefined ? { refreshToken: body.refresh_token } : {}),
        ...(body.expires_in !== undefined ? { expiresIn: body.expires_in } : {}),
      }
    },

    getUserInfo: async (accessToken) => {
      // 1. Profile
      const profileRes = await fetch(`${apiBase}/user`, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          Accept: 'application/vnd.github+json',
          'X-GitHub-Api-Version': '2022-11-28',
        },
      })
      if (!profileRes.ok) {
        throw new Error(`GitHub /user failed (${profileRes.status}): ${await profileRes.text()}`)
      }
      const profile = (await profileRes.json()) as {
        id: number
        login: string
        name?: string | null
        avatar_url?: string
        email?: string | null
      }

      // 2. Verified primary email — GitHub returns null on /user.email when the
      //    user has hidden their email, so we always fetch the email list.
      const emailRes = await fetch(`${apiBase}/user/emails`, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          Accept: 'application/vnd.github+json',
          'X-GitHub-Api-Version': '2022-11-28',
        },
      })
      if (!emailRes.ok) {
        throw new Error(`GitHub /user/emails failed (${emailRes.status}): ${await emailRes.text()}`)
      }
      const emails = (await emailRes.json()) as Array<{
        email: string
        primary: boolean
        verified: boolean
        visibility: string | null
      }>
      const primary = emails.find((e) => e.primary && e.verified) ?? emails.find((e) => e.verified)
      if (!primary) {
        throw new Error('GitHub account has no verified email')
      }

      return {
        id: String(profile.id),
        email: primary.email,
        emailVerified: primary.verified,
        ...(profile.name ? { name: profile.name } : { name: profile.login }),
        ...(profile.avatar_url ? { picture: profile.avatar_url } : {}),
      }
    },
  }
}
