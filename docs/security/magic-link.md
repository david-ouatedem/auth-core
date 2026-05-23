# Magic-Link Login

AuthCore 0.12 adds passwordless email sign-in. Users enter their email, receive a one-time link, click it, and land authenticated. No password required.

## When to use it

- Apps where passwords are friction (consumer products, internal tools, low-stakes SaaS).
- Apps that pair magic-link with email/password (Slack, Notion, Linear pattern — users choose either path).
- OAuth-only apps that want a fallback for users who don't have a supported provider account.

## How it works

1. User submits email to `POST /auth/magic-link`. The server **always returns 200** whether the email exists or not — enumeration-safe.
2. The server upserts a user record (with a sentinel `passwordHash`) and emails a one-time link `${magicLinkUrl}?token=…`. Token TTL: 15 minutes.
3. User clicks the link, lands on `GET /auth/magic-link/consume?token=…`. Server verifies the token (hashed SHA-256 lookup), deletes the row (single-use), mints a JWT + refresh token.
4. Cookie mode → server sets the standard 3 cookies and redirects to `magicLinkSuccessRedirect`. API mode → returns `{ user, token, refreshToken }` JSON (or redirects with `#token=…&refreshToken=…` if `magicLinkSuccessRedirect` is set).

The token is the same opaque-32-bytes-then-SHA256-hashed structure used for password reset and email verification. Same security properties: timing-safe lookup, hashed at rest, single-use.

## Enable the feature

```ts
const auth = createAuth({
  db: prismaAdapter(prisma),
  session: { strategy: 'jwt', secret: process.env.AUTH_SECRET! },
  features: ['magicLink'],
  email: {
    provider: resendAdapter(process.env.RESEND_API_KEY!),
    from: 'auth@yourdomain.com',
  },
})
```

Then mount your framework adapter with optional redirects:

```ts
// Express
app.use('/auth', auth.router({
  baseUrl: 'https://api.myapp.com',
  useCookies: true,
  magicLinkSuccessRedirect: 'https://myapp.com/',
}))

// Fastify
await app.register(auth.plugin({
  baseUrl: 'https://api.myapp.com',
  useCookies: true,
  magicLinkSuccessRedirect: 'https://myapp.com/',
}), { prefix: '/auth' })

// NestJS
AuthModule.register({
  // ...
  baseUrl: 'https://api.myapp.com',
  useCookies: true,
  magicLinkSuccessRedirect: 'https://myapp.com/',
})
```

## Routes added

| Method | Path | Description |
|--------|------|-------------|
| POST | `/auth/magic-link` | Send a magic-link email. Body: `{ email }`. Always 200. |
| GET | `/auth/magic-link/consume` | Consume a token. Query: `?token=…`. Mints session. |

## Client integration

```tsx
import { useAuth } from '@authcore/react'

function SignInForm() {
  const { signInWithMagicLink } = useAuth()
  const [sent, setSent] = useState(false)
  const onSubmit = async (e) => {
    e.preventDefault()
    await signInWithMagicLink(e.target.email.value)
    setSent(true)
  }
  if (sent) return <p>Check your email for a sign-in link.</p>
  return (
    <form onSubmit={onSubmit}>
      <input name="email" type="email" required />
      <button>Send sign-in link</button>
    </form>
  )
}

// On the page you set as magicLinkSuccessRedirect (or any callback page)
function MagicLinkLanding() {
  const { handleMagicLinkCallback } = useAuth()
  useEffect(() => {
    handleMagicLinkCallback().catch(console.error)
  }, [])
  return <p>Signing you in…</p>
}
```

`handleMagicLinkCallback()` is smart about three cases:

- **Direct email-link click** — URL has `?token=…`. The client calls `/auth/magic-link/consume` itself, populates state, and strips `?token=` from history.
- **API mode + server-side redirect** — URL has `#token=…&refreshToken=…` in the fragment. The client reads tokens from the fragment, populates state, clears the fragment.
- **Cookie mode + server-side redirect** — cookies are already set. The client fetches `/me` to populate the user.

## Customizing the email

```ts
createAuth({
  ...,
  email: {
    provider: resendAdapter(...),
    from: 'auth@app.com',
    templates: {
      magicLink: ({ email, link, ttlMinutes }) => ({
        subject: `Sign in to MyApp`,
        html: `
          <h1>Welcome back</h1>
          <p>Click <a href="${link}">here</a> to sign in. Expires in ${ttlMinutes} minutes.</p>
        `,
        text: `Sign in: ${link}`,
      }),
    },
  },
})
```

## Auto-create vs. login-only

By default magic-link **creates a new user** if no user exists for the email. Clicking the link verifies the email by definition (the link arrived in their inbox), so the new user is created with `emailVerified: true` and the standard sentinel password hash `!MAGIC_LINK_NO_PASSWORD`.

To make magic-link login-only (refuse unknown emails silently), pass `autoCreate: false` if you're calling `sendMagicLink` directly from `@authcore/core`. Today the framework adapters always use the default; we'll surface this as a config option if there's demand.

## Security notes

- **Tokens are single-use.** Consuming a token deletes the row before returning the session. A second click on the same link returns 400 `INVALID_TOKEN` — by design.
- **15-minute TTL** balances usability (slow email delivery) and revocability (limited replay window if email is forwarded).
- **No password set on auto-created users.** They have the sentinel `!MAGIC_LINK_NO_PASSWORD` hash that no password can match. They can claim a real password via the standard forgot-password flow.
- **Always returns 200 from `/magic-link`** — never reveals whether the email exists. Same enumeration property as forgot-password.

## Error codes

| Code | HTTP | Cause |
|------|------|-------|
| `FEATURE_DISABLED` | 500 | `features: ['magicLink']` not enabled on the auth config |
| `EMAIL_NOT_CONFIGURED` | 500 | No `email.provider` set on the auth config |
| `MISSING_URL` | 500 | Framework adapter didn't supply `magicLinkUrl` (shouldn't happen with built-in adapters) |
| `INVALID_TOKEN` | 400 | Token is unknown, expired, or already consumed |
