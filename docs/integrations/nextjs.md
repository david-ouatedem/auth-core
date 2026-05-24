# Next.js

`@authcore/nextjs` is the App Router adapter. One catch-all route handler, server-side `getCurrentUser()` helpers, and an edge-safe middleware factory.

## Install

```bash
pnpm add @authcore/nextjs @authcore/core @authcore/prisma-adapter @authcore/resend-adapter
```

Supports **Next.js 13.4 +**, **14**, and **15** on the App Router.

## Set up the AuthCore instance

Create one `lib/auth.ts` that defines your auth instance and exports the things your app needs:

```ts
// lib/auth.ts
import { createAuth, createGoogleProvider } from '@authcore/core'
import { prismaAdapter } from '@authcore/prisma-adapter'
import { resendAdapter } from '@authcore/resend-adapter'
import { createNextAuthHandler, createServerHelpers } from '@authcore/nextjs'
import { prisma } from './prisma'

export const auth = createAuth({
  db: prismaAdapter(prisma),
  session: {
    strategy: 'jwt',
    secret: process.env.AUTH_SECRET!,
    cookieName: 'authcore_token',
  },
  email: {
    provider: resendAdapter(process.env.RESEND_API_KEY!),
    from: 'auth@yourdomain.com',
  },
  features: ['emailVerification', 'passwordReset', 'magicLink'],
  oauth: {
    google: createGoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
    }),
  },
})

export const { GET, POST } = createNextAuthHandler(auth, {
  baseUrl: process.env.NEXT_PUBLIC_BASE_URL!,  // e.g. 'https://myapp.com'
  useCookies: true,
  oauthSuccessRedirect: '/',
  magicLinkSuccessRedirect: '/',
})

export const { getCurrentUser, requireUser } = createServerHelpers(auth)
```

## Mount the catch-all route

```ts
// app/api/auth/[...authcore]/route.ts
export { GET, POST } from '@/lib/auth'
export const runtime = 'nodejs'    // bcryptjs + jsonwebtoken need Node, not Edge
export const dynamic = 'force-dynamic'
```

That single file exposes every AuthCore route:

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/auth/register` | Create account |
| POST | `/api/auth/login` | Sign in |
| POST | `/api/auth/logout` | Sign out (revokes refresh) |
| GET | `/api/auth/me` | Current user (Bearer or cookie) |
| POST | `/api/auth/refresh` | Rotate refresh token |
| POST | `/api/auth/revoke` | Revoke refresh token |
| POST | `/api/auth/verify-email` | Verify email |
| POST | `/api/auth/forgot-password` | Request reset |
| POST | `/api/auth/reset-password` | Complete reset |
| POST | `/api/auth/invite` | Invite (authed) |
| POST | `/api/auth/accept-invitation` | Accept invite |
| GET | `/api/auth/oauth/:provider` | Begin OAuth flow |
| GET | `/api/auth/oauth/:provider/callback` | OAuth callback |
| POST | `/api/auth/magic-link` | Send magic-link email |
| GET | `/api/auth/magic-link/consume` | Consume magic-link token |

## Use the session in Server Components

```tsx
// app/dashboard/page.tsx
import { redirect } from 'next/navigation'
import { getCurrentUser } from '@/lib/auth'

export default async function Dashboard() {
  const user = await getCurrentUser()
  if (!user) redirect('/login')
  return <h1>Welcome {user.email}</h1>
}
```

`getCurrentUser()` reads the auth cookie via `next/headers`, verifies the JWT with `auth.verifyToken`, and returns the user or `null`. Works in **Server Components, Route Handlers, and Server Actions**.

If middleware already gates the route (so reaching the component means the user is signed in) use `requireUser()` for a non-null return:

```tsx
import { requireUser } from '@/lib/auth'
export default async function Account() {
  const user = await requireUser()  // throws if no session
  return <p>{user.email}</p>
}
```

## Protect routes with middleware

```ts
// middleware.ts
import { createAuthMiddleware } from '@authcore/nextjs/middleware'

export default createAuthMiddleware({
  publicRoutes: ['/', '/login', '/signup', '/api/auth'],
})

export const config = {
  matcher: ['/((?!_next|favicon).*)'],
}
```

The middleware does a **presence check** on the auth cookie — no JWT verification at the edge. Verification happens in Server Components via `getCurrentUser`. This keeps middleware fast and edge-compatible without dragging in `jsonwebtoken`.

When a request hits a protected path with no cookie, the middleware redirects to `/login` (configurable via `loginUrl`) with `?next=…` so the login page can return the user to where they were going.

## Client integration

Wrap your app with `<AuthProvider>` (a Client Component):

```tsx
// app/providers.tsx
'use client'
import { AuthProvider } from '@authcore/nextjs/client'

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <AuthProvider baseUrl="" mode="cookie">
      {children}
    </AuthProvider>
  )
}
```

```tsx
// app/layout.tsx
import { Providers } from './providers'
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return <html><body><Providers>{children}</Providers></body></html>
}
```

`baseUrl=""` because the API routes are same-origin in a Next.js app. `mode="cookie"` is the recommended Next.js default (httpOnly cookies set by the route handler).

Then use `useAuth()` in any Client Component:

```tsx
'use client'
import { useAuth } from '@authcore/nextjs/client'

export function LoginForm() {
  const { signIn, signInWithProvider, signInWithMagicLink } = useAuth()
  // …
}
```

## Pitfalls

- **Always set `export const runtime = 'nodejs'`** in `app/api/auth/[...authcore]/route.ts`. The default Edge runtime can't run `bcryptjs` or `jsonwebtoken`.
- **`AUTH_SECRET` must be available at request time.** In Next.js, `process.env.AUTH_SECRET` reads from server-side env vars — never leak it into a `NEXT_PUBLIC_…` variable.
- **`NEXT_PUBLIC_BASE_URL`** is the only env var you should expose to the browser. The client SDK uses same-origin (`baseUrl=""`) so this is only needed by server code to build email links.
- **Cookie domain across subdomains** — if your API is at `api.myapp.com` and your frontend is at `myapp.com`, set `cookieName` explicitly and configure cookies with the parent domain. By default Next.js sets cookies for the current host only.

## Next steps

- See [Configuration](/configuration) for the full `AuthCore` config surface.
- [Magic-link login](/security/magic-link) — passwordless sign-in pairs especially well with Next.js.
- [OAuth](/security/oauth) — 5 bundled providers; the client + server flows work the same in Next.js as elsewhere.
