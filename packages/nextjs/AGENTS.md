# @authcore/nextjs: guidance for AI coding agents

Next.js App Router only (13.4+, 14, 15). The route handler must run on the Node runtime (bcryptjs + jsonwebtoken), not Edge.

## Install

```bash
npm install @authcore/nextjs @authcore/core @authcore/prisma-adapter
```

## Canonical usage

```ts
// lib/auth.ts
import { createAuth } from '@authcore/core'
import { prismaAdapter } from '@authcore/prisma-adapter'
import { createNextAuthHandler, createServerHelpers } from '@authcore/nextjs'
import { prisma } from './prisma'

export const auth = createAuth({
  db: prismaAdapter(prisma),
  session: { strategy: 'jwt', secret: process.env.AUTH_SECRET!, cookieName: 'authcore_token' },
})
export const { GET, POST } = createNextAuthHandler(auth, {
  baseUrl: process.env.NEXT_PUBLIC_BASE_URL!,
  useCookies: true,
})
export const { getCurrentUser, requireUser } = createServerHelpers(auth)
```

```ts
// app/api/auth/[...authcore]/route.ts
export { GET, POST } from '@/lib/auth'
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
```

```tsx
// Server Component
const user = await getCurrentUser()
if (!user) redirect('/login')
```

`middleware.ts` can use `createAuthMiddleware` from `@authcore/nextjs/middleware` (client components: `@authcore/nextjs/client`). It only checks cookie presence (edge-safe); always verify with `getCurrentUser()` / `requireUser()` on the server before returning protected data.

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
