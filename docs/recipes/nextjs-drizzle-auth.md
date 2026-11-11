---
description: "Add authentication to a Next.js App Router app with Drizzle ORM and AuthCore: one route handler, getCurrentUser() in Server Components, and middleware."
---

# Next.js + Drizzle: auth in the App Router

Goal: sign-up, sign-in, protected Server Components and middleware in a Next.js 15 App Router app using Drizzle on Postgres.

## 1. Install

```bash
pnpm add @authcore/nextjs @authcore/core @authcore/drizzle-adapter drizzle-orm pg
pnpm add -D drizzle-kit
```

## 2. Tables

```ts
// db/schema.ts
export { users, tokens, oauthAccounts, tokenTypeEnum } from '@authcore/drizzle-adapter/pg'
```

```bash
pnpm drizzle-kit generate && pnpm drizzle-kit migrate
```

See the [Drizzle adapter](/adapters/drizzle) page for `drizzle.config.ts` and the SQLite variant.

## 3. The auth instance

```ts
// lib/auth.ts
import { createAuth } from '@authcore/core'
import { drizzleAdapter } from '@authcore/drizzle-adapter/pg'
import { createNextAuthHandler, createServerHelpers } from '@authcore/nextjs'
import { db } from '../db'

export const auth = createAuth({
  db: drizzleAdapter(db),
  session: { strategy: 'jwt', secret: process.env.AUTH_SECRET!, cookieName: 'authcore_token' },
})

export const { GET, POST } = createNextAuthHandler(auth, {
  baseUrl: process.env.NEXT_PUBLIC_BASE_URL!,
  useCookies: true,
})
export const { getCurrentUser, requireUser } = createServerHelpers(auth)
```

## 4. The route

```ts
// app/api/auth/[...authcore]/route.ts
export { GET, POST } from '@/lib/auth'
export const runtime = 'nodejs'        // bcryptjs and jsonwebtoken need Node
export const dynamic = 'force-dynamic'
```

## 5. Use it

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

```ts
// middleware.ts: cookie-presence gate (edge-safe). Always re-check on the server.
import { createAuthMiddleware } from '@authcore/nextjs/middleware'
```

See [Next.js integration](/integrations/nextjs#protect-routes-with-middleware) for the middleware options and the client `AuthProvider`.

## Next

[OAuth login](/security/oauth) · [Magic links](/security/magic-link) · [Full Next.js demo](/examples/nextjs)
