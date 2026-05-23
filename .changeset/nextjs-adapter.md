---
"@authcore/types": minor
"@authcore/core": minor
"@authcore/core-web": minor
"@authcore/prisma-adapter": minor
"@authcore/resend-adapter": minor
"@authcore/nodemailer-adapter": minor
"@authcore/express": minor
"@authcore/fastify": minor
"@authcore/nestjs": minor
"@authcore/react": minor
"@authcore/nextjs": minor
"create-authcore-app": minor
---

Add **`@authcore/nextjs`** — Next.js App Router adapter. Supports Next 13.4+, 14, and 15.

One catch-all route handler exposes every AuthCore route under `/api/auth/*`:

```ts
// lib/auth.ts
import { createAuth } from '@authcore/core'
import { createNextAuthHandler, createServerHelpers } from '@authcore/nextjs'

export const auth = createAuth({ ... })
export const { GET, POST } = createNextAuthHandler(auth, { baseUrl: '...', useCookies: true })
export const { getCurrentUser, requireUser } = createServerHelpers(auth)
```

```ts
// app/api/auth/[...authcore]/route.ts
export { GET, POST } from '@/lib/auth'
export const runtime = 'nodejs'
```

Three additional entry points for the things Next.js wires up separately:

- `@authcore/nextjs/server` — `getCurrentUser`, `requireUser` (call inside Server Components / Route Handlers / Server Actions; reads the cookie via `next/headers`).
- `@authcore/nextjs/middleware` — `createAuthMiddleware()` — edge-safe presence check that gates protected paths and redirects to `/login?next=…`.
- `@authcore/nextjs/client` — `'use client'` re-export of `<AuthProvider>`, `useAuth`, `<ProtectedRoute>` from `@authcore/react`.

All existing AuthCore features are available: refresh tokens, CSRF, OAuth (Google/GitHub/Microsoft/Discord/Apple), magic-link login, RBAC. Cookie mode is the recommended Next.js default.
