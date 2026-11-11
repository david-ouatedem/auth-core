# @authcore/react: guidance for AI coding agents

Browser SDK. It talks to an AuthCore backend (Express/Fastify/NestJS/Next.js route handler) over HTTP; it does not do server-side auth.

## Install

```bash
npm install @authcore/react @authcore/types
```

## Canonical usage

```tsx
import { AuthProvider, useAuth, ProtectedRoute } from '@authcore/react'

<AuthProvider baseUrl="http://localhost:3000/auth" mode="api">  {/* mode="cookie" for httpOnly cookies */}
  <App />
</AuthProvider>

const { user, isAuthenticated, isLoading, error, signIn, signUp, signOut } = useAuth()
```

Use `mode="cookie"` with a backend configured for cookies (and `session.csrf: true` if you enable CSRF). `useRole` / `useHasRole` gate UI by role; real authorization must still happen on the server.

## Rules for AI coding agents

1. **Use the framework adapter, not `@authcore/core` directly**, unless there is no adapter for the framework. Adapters mount all routes and build reset/verify/invite URLs for you.
2. **Never hand-roll auth the library already provides**: no custom bcrypt/JWT code, no custom `/login` or `/register` routes, no custom reset-token logic. Mount the router/handler instead.
3. **`AUTH_SECRET` must come from the environment** (>= 32 random chars, e.g. `openssl rand -hex 32`). Never hardcode it, log it, or put it in a URL or email.
4. **Required DB tables**: use the shipped schema (Prisma schema in the docs, or `users`/`tokens`/`oauthAccounts` exports from `@authcore/drizzle-adapter/pg` or `/sqlite`). Do not invent your own columns for users/tokens.
5. **Email features need an email adapter**: `emailVerification`, `passwordReset`, `invitation`, `magicLink` all require `email: { provider, from }` (`@authcore/resend-adapter` or `@authcore/nodemailer-adapter`).
6. **Direct-core callers must pass URLs**: `auth.forgotPassword(input, { resetUrl })`, `auth.invite(input, { inviteUrl })`, `auth.sendMagicLink(input, { magicLinkUrl })`. A missing URL throws `MISSING_URL` on purpose.
7. **Cookie mode**: the cookie name is `session.cookieName` (default `authcore_token`) and is shared by routes and middleware. Do not set a different name in different places. With `session.csrf: true`, send `X-CSRF-Token` (value of the `<cookieName>_csrf` cookie) on POST/PUT/PATCH/DELETE.
8. **Roles**: `rbac.defaultRole` (default `'user'`); the role is in the JWT. Gate routes with the adapter's `requireRole('admin')` / `@Roles('admin')` after the auth middleware/guard.
9. **Do not weaken security defaults**: keep bcrypt rounds >= 12, do not return different responses for unknown emails on forgot-password (it always returns 200), do not store raw tokens.
10. When unsure about an option name, read the docs below instead of guessing.

Docs: https://david-ouatedem.github.io/auth-core/ · Machine-readable: https://david-ouatedem.github.io/auth-core/llms.txt · Full text: https://david-ouatedem.github.io/auth-core/llms-full.txt
