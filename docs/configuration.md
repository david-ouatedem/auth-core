# Configuration

The `AuthCoreConfig` object is the single configuration point for AuthCore.

```ts
interface AuthCoreConfig {
  db: DatabaseAdapter
  session: SessionConfig
  email?: EmailConfig
  features?: Array<'emailVerification' | 'passwordReset' | 'invitation'>
  password?: { minLength?: number; saltRounds?: number }
  rbac?: { defaultRole?: string }
  callbacks?: AuthCallbacks
}
```

## `db` (required)

A `DatabaseAdapter` implementation. See [Prisma Adapter](/adapters/prisma).

```ts
import { prismaAdapter } from '@authcore/prisma-adapter'

const config = {
  db: prismaAdapter(prisma),
  // ...
}
```

## `session` (required)

```ts
interface SessionConfig {
  strategy: 'jwt'
  secret: string              // minimum 32 characters in production
  expiresIn?: string          // access-token (JWT) expiry. default: '7d'. With refresh tokens, use '15m'.
  refreshExpiresIn?: string   // refresh-token expiry. default: '30d'.
  cookieName?: string         // default: 'authcore_token'. Refresh cookie = `${cookieName}_refresh`. CSRF cookie = `${cookieName}_csrf`.
  csrf?: boolean              // opt-in synchronizer-token CSRF protection in cookie mode. default: false.
}
```

`cookieName` is the **single source of truth** for the auth cookie name. It's read by both the route handlers that set the cookie and the middleware/guards that read it. Per-router overrides (`router({ cookieName })`) are honored for backward compatibility but the canonical place is `session.cookieName`.

`refreshExpiresIn` controls how long refresh tokens are valid. Refresh tokens rotate on every `POST /auth/refresh` — the old one is invalidated as the new one is issued. See [Refresh Tokens](/security/refresh-tokens).

`csrf: true` enables CSRF protection in cookie mode. Off by default for backward compatibility. See [CSRF](/security/csrf).

## `email` (optional)

Required if you enable `emailVerification`, `passwordReset`, or `invitation`.

```ts
interface EmailConfig {
  provider: EmailAdapter
  from: string                 // e.g. 'noreply@myapp.com'
  templates?: EmailTemplates   // per-feature template overrides; defaults used when unset
}

interface EmailTemplates {
  verifyEmail?:   (ctx: { email: string; link: string; ttlHours: number }) => { subject, html, text }
  resetPassword?: (ctx: { email: string; link: string; ttlHours: number }) => { subject, html, text }
  invitation?:    (ctx: { email: string; link: string; ttlHours: number; role: string }) => { subject, html, text }
}
```

See [Resend](/adapters/resend) or [Nodemailer](/adapters/nodemailer) adapters and [Email Templates](/security/email-templates) for customization.

## `features` (optional)

Enable built-in features. Each feature adds routes to the auth router.

```ts
const config = {
  features: ['emailVerification', 'passwordReset', 'invitation'],
  email: {
    provider: resendAdapter(process.env.RESEND_API_KEY!),
    from: 'noreply@myapp.com',
  },
  // ...
}
```

| Feature | Effect | Token TTL |
|---------|--------|-----------|
| `emailVerification` | Sends verification email; login blocks unverified users; adds `/verify-email` route | 24h |
| `passwordReset` | Adds `/forgot-password` and `/reset-password` routes | 1h |
| `invitation` | Adds `/invite` (protected) and `/accept-invitation` (public) routes | 48h |

## `rbac` (optional)

```ts
const config = {
  rbac: { defaultRole: 'user' },  // default: 'user'
}
```

Every user gets a `role` field (string). The default role for new registrations is `'user'`, configurable via `rbac.defaultRole`. The role is embedded in the JWT payload, so authorization checks need no extra DB lookup. Combine with `auth.requireRole(...)` middleware (Express/Fastify) or `RolesGuard` + `@Roles(...)` (NestJS).

## `password` (optional)

```ts
const config = {
  password: {
    minLength: 8,    // default: 8
    saltRounds: 12,  // default: 12 (silently clamped from below for safety)
  },
  // ...
}
```

## `callbacks` (optional)

Lifecycle hooks called after auth events.

```ts
const config = {
  callbacks: {
    onSignUp: async (user) => { /* ... */ },
    onSignIn: async (user) => { /* ... */ },
    onSignOut: async (userId) => { /* ... */ },
    onPasswordReset: async (user) => { /* ... */ },
    onTokenRefresh: async (user) => { /* ... */ },        // fires after every refresh
    onFailedLogin: async (email, reason) => { /* ... */ },// 'INVALID_CREDENTIALS' | 'EMAIL_NOT_VERIFIED' — wire to rate limiter
  },
  // ...
}
```

## Auth Routes

The following routes are registered by `auth.router()` (Express), `auth.plugin()` (Fastify), or `AuthModule.register()` (NestJS):

| Method | Path | Description |
|--------|------|-------------|
| POST | `/register` | Create a new user |
| POST | `/login` | Authenticate and get a token |
| POST | `/logout` | Clear session (cookie mode) |
| GET | `/me` | Get current user (protected) |
| POST | `/verify-email` | Verify email with token |
| POST | `/forgot-password` | Request password reset (always 200) |
| POST | `/reset-password` | Reset password with token |
| POST | `/invite` | Invite a user by email + role (protected) |
| POST | `/accept-invitation` | Accept invitation, set password (public) |
| POST | `/refresh` | Exchange a refresh token for a new JWT + rotated refresh token |
| POST | `/revoke` | Revoke a refresh token (idempotent) |

All route paths are customizable via the `routes` option in the router/plugin config.

## Direct-core callers: `forgotPassword` requires `resetUrl`

If you call `createAuth()` from `@authcore/core` directly (not through a framework adapter), you must pass `resetUrl` as the second argument:

```ts
await auth.forgotPassword({ email: user.email }, { resetUrl: 'https://app.example.com/reset-password' })
```

Framework adapters build this from `baseUrl + paths.resetPassword` automatically. Calling `forgotPassword` directly without `resetUrl` while `passwordReset` is enabled throws `AuthError('resetUrl is required', 'MISSING_URL', 500)` — a deliberate loud failure that replaces the pre-0.9 silent leak of `session.secret` into email URLs.
