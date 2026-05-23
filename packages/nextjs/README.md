# @authcore/nextjs

Next.js (App Router) adapter for AuthCore. Supports Next 13.4+, 14, and 15.

## Install

```bash
pnpm add @authcore/nextjs @authcore/core @authcore/prisma-adapter
```

## Quick start

```ts
// lib/auth.ts
import { createAuth } from '@authcore/core'
import { prismaAdapter } from '@authcore/prisma-adapter'
import { createNextAuthHandler, createServerHelpers } from '@authcore/nextjs'
import { prisma } from './prisma'

export const auth = createAuth({
  db: prismaAdapter(prisma),
  session: { strategy: 'jwt', secret: process.env.AUTH_SECRET! },
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

```ts
// middleware.ts
import { createAuthMiddleware } from '@authcore/nextjs/middleware'

export default createAuthMiddleware({
  publicRoutes: ['/', '/login', '/api/auth'],
})

export const config = { matcher: ['/((?!_next|favicon).*)'] }
```

```tsx
// app/dashboard/page.tsx
import { getCurrentUser } from '@/lib/auth'
import { redirect } from 'next/navigation'

export default async function Dashboard() {
  const user = await getCurrentUser()
  if (!user) redirect('/login')
  return <h1>Welcome {user.email}</h1>
}
```

```tsx
// app/providers.tsx
'use client'
import { AuthProvider } from '@authcore/nextjs/client'

export function Providers({ children }: { children: React.ReactNode }) {
  return <AuthProvider baseUrl="" mode="cookie">{children}</AuthProvider>
}
```

## Subpath entry points

| Import | Use in | Purpose |
|--------|--------|---------|
| `@authcore/nextjs` | Server code (lib/auth.ts) | Handler factory + server helpers |
| `@authcore/nextjs/server` | Server Components, Route Handlers | `getCurrentUser`, `requireUser` |
| `@authcore/nextjs/middleware` | `middleware.ts` | Edge-safe presence check |
| `@authcore/nextjs/client` | Client Components | `<AuthProvider>`, `useAuth`, `<ProtectedRoute>` |

## Documentation

See [the full Next.js guide](https://david-ouatedem.github.io/auth-core/integrations/nextjs.html).

## License

MIT
