# OAuth (Sign in with Google)

AuthCore 0.11 ships OAuth 2.0 + PKCE support. Google is the bundled provider; the `OAuthProvider` interface lets you (or the community) add others without changing core.

## How it works

The flow follows the [OAuth 2.0 Authorization Code + PKCE](https://datatracker.ietf.org/doc/html/rfc7636) spec.

1. App redirects the user to `GET /auth/oauth/google`.
2. AuthCore generates a PKCE code verifier, builds an HMAC-signed state envelope, and 302s the user to Google's authorization URL.
3. User consents at Google, which 302s back to `GET /auth/oauth/google/callback?code=…&state=…`.
4. AuthCore verifies the HMAC on `state`, checks it hasn't expired (10 min TTL), and confirms `redirectUri` matches what was sent originally.
5. AuthCore exchanges the `code` (+ PKCE verifier) for tokens, fetches the user profile.
6. **Auto-link policy:**
   - Existing `OAuthAccount` row → load the linked user.
   - No `OAuthAccount`, no local user with this email → create a new user (with a sentinel password hash that can never match a password).
   - No `OAuthAccount`, local user with this email, **provider says email is verified** → link the OAuth account to the existing user.
   - No `OAuthAccount`, local user with this email, **provider says email is NOT verified** → throw `EMAIL_NOT_VERIFIED_BY_PROVIDER` (409). Sign in with password first.
7. AuthCore mints a JWT + refresh token (same as `login`) and either sets cookies (cookie mode) or returns JSON (api mode).

State is **stateless** — the HMAC envelope carries the nonce, provider id, PKCE verifier, redirect URI, and issued-at timestamp. There is no DB write at the start of the flow.

## Server setup

```ts
import { createAuth, createGoogleProvider } from '@authcore/core'
import { prismaAdapter } from '@authcore/prisma-adapter'

const auth = createAuth({
  db: prismaAdapter(prisma),
  session: { strategy: 'jwt', secret: process.env.AUTH_SECRET! },
  oauth: {
    google: createGoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
    }),
  },
})
```

Routes are mounted automatically by every framework adapter:

| Method | Path | Description |
|--------|------|-------------|
| GET | `/auth/oauth/:provider` | Redirects to provider authorization URL |
| GET | `/auth/oauth/:provider/callback` | Provider redirects here; we mint a session |

### Express

```ts
app.use('/auth', auth.router({
  baseUrl: 'https://api.myapp.com',
  useCookies: true,                          // recommended
  oauthSuccessRedirect: 'https://myapp.com/',  // where to land after success
}))
```

### Fastify

```ts
await app.register(auth.plugin({
  baseUrl: 'https://api.myapp.com',
  useCookies: true,
  oauthSuccessRedirect: 'https://myapp.com/',
}), { prefix: '/auth' })
```

### NestJS

```ts
@Module({
  imports: [
    AuthModule.register({
      db: prismaAdapter(prisma),
      session: { strategy: 'jwt', secret: process.env.AUTH_SECRET! },
      oauth: { google: createGoogleProvider({ ... }) },
      baseUrl: 'https://api.myapp.com',
      useCookies: true,
      oauthSuccessRedirect: 'https://myapp.com/',
    }),
  ],
})
```

### Configuring the Google OAuth client

1. Go to the [Google Cloud Console](https://console.cloud.google.com/apis/credentials).
2. Create an OAuth 2.0 Client ID (type: Web application).
3. **Authorized redirect URI** must be exactly `${baseUrl}/auth/oauth/google/callback`.
4. Save Client ID + Client Secret to environment variables.

## Client setup (`@authcore/react`)

```tsx
import { useAuth } from '@authcore/react'

function SignInPage() {
  const { signInWithProvider } = useAuth()
  return (
    <button onClick={() => signInWithProvider('google')}>
      Sign in with Google
    </button>
  )
}

// On the page the server redirects to after a successful OAuth flow:
function OAuthCallbackPage() {
  const { handleOAuthCallback } = useAuth()
  useEffect(() => {
    handleOAuthCallback().catch(console.error)
  }, [])
  return <p>Signing you in…</p>
}
```

In **cookie mode**, `handleOAuthCallback()` just calls `/me` — the browser already has the cookies.

In **api mode**, set `oauthSuccessRedirect` on the server to a frontend URL. The server redirects with `#token=…&refreshToken=…` in the fragment, and `handleOAuthCallback()` reads it, persists the token, and clears the fragment.

## Adding a new provider

Implement the `OAuthProvider` interface:

```ts
import type { OAuthProvider } from '@authcore/types'

export function createGithubProvider(config: {
  clientId: string
  clientSecret: string
}): OAuthProvider {
  return {
    id: 'github',
    scopes: ['read:user', 'user:email'],
    authorize: ({ state, codeChallenge, redirectUri }) => {
      const u = new URL('https://github.com/login/oauth/authorize')
      u.searchParams.set('client_id', config.clientId)
      u.searchParams.set('redirect_uri', redirectUri)
      u.searchParams.set('state', state)
      u.searchParams.set('code_challenge', codeChallenge)
      u.searchParams.set('code_challenge_method', 'S256')
      u.searchParams.set('scope', 'read:user user:email')
      return u.toString()
    },
    exchangeCode: async ({ code, codeVerifier, redirectUri }) => {
      // POST to github.com/login/oauth/access_token with the code + verifier
      // …
    },
    getUserInfo: async (accessToken) => {
      // GET https://api.github.com/user + /user/emails
      // …
      return { id: '…', email: '…', emailVerified: true }
    },
  }
}
```

Then register it alongside Google: `oauth: { google, github }`. The framework routes pick the provider by URL slug automatically.

## Security notes

- **PKCE is required** — the AuthCore core always sends `code_challenge` + `code_challenge_method=S256`. Providers without PKCE support won't be compatible.
- **State envelope is HMAC-signed with `session.secret`.** A leaked secret invalidates all in-flight OAuth flows.
- **No state TTL means no replay window.** The current TTL is 10 minutes — enough for slow consent screens, short enough to prevent intercepted callbacks from being reused.
- **Email verification by the provider is mandatory for auto-linking.** If a provider says `emailVerified: false`, AuthCore refuses to link the OAuth account to an existing local user. This blocks an attacker from registering an unverified Gmail with someone else's email and hijacking the account.
- **No password is set for OAuth-only users.** They have a sentinel `passwordHash` (`!OAUTH_NO_PASSWORD`) that can never match a real password. They can claim a password via the standard forgot-password flow.

## Error codes

| Code | HTTP | Cause |
|------|------|-------|
| `OAUTH_PROVIDER_UNKNOWN` | 400 | Provider id not registered in `config.oauth` |
| `INVALID_TOKEN` | 401 | State HMAC invalid, expired, or `redirectUri` mismatch |
| `OAUTH_EXCHANGE_FAILED` | 502 | Provider's token endpoint returned non-2xx |
| `OAUTH_USERINFO_FAILED` | 502 | Provider's userinfo endpoint returned non-2xx |
| `EMAIL_NOT_VERIFIED_BY_PROVIDER` | 409 | A local user exists with that email but the provider hasn't verified ownership |
