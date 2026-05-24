# @authcore/nextjs

## 0.12.0

### Minor Changes

- 6b7cc5f: Add **`@authcore/drizzle-adapter`** — Drizzle ORM database adapter. Postgres + SQLite, with the same `DatabaseAdapter` contract as `@authcore/prisma-adapter`.

  ```ts
  // Postgres
  import { drizzle } from "drizzle-orm/node-postgres";
  import { drizzleAdapter } from "@authcore/drizzle-adapter/pg";

  const auth = createAuth({
    db: drizzleAdapter(drizzle(pool)),
    // …
  });
  ```

  ```ts
  // SQLite
  import { drizzle } from "drizzle-orm/better-sqlite3";
  import { drizzleAdapter } from "@authcore/drizzle-adapter/sqlite";

  const auth = createAuth({
    db: drizzleAdapter(drizzle(sqlite)),
    // …
  });
  ```

  Two subpath entries (`/pg`, `/sqlite`) export pre-built table definitions you re-export from your own `db/schema.ts` so `drizzle-kit generate` picks them up. Users can also redefine the tables locally to add extra columns and pass the bundle to `drizzleAdapter(db, schema)`.

  Peer dep: `drizzle-orm` `>=0.30.0 <0.40.0`. The dialect driver (`pg` or `better-sqlite3`) is your own dep — install whichever one you need.

  A side-by-side adapter comparison and schema-extension guide live at `docs/adapters/drizzle.md`.

- 347461a: Add **`@authcore/nextjs`** — Next.js App Router adapter. Supports Next 13.4+, 14, and 15.

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
  export { GET, POST } from "@/lib/auth";
  export const runtime = "nodejs";
  ```

  Three additional entry points for the things Next.js wires up separately:

  - `@authcore/nextjs/server` — `getCurrentUser`, `requireUser` (call inside Server Components / Route Handlers / Server Actions; reads the cookie via `next/headers`).
  - `@authcore/nextjs/middleware` — `createAuthMiddleware()` — edge-safe presence check that gates protected paths and redirects to `/login?next=…`.
  - `@authcore/nextjs/client` — `'use client'` re-export of `<AuthProvider>`, `useAuth`, `<ProtectedRoute>` from `@authcore/react`.

  All existing AuthCore features are available: refresh tokens, CSRF, OAuth (Google/GitHub/Microsoft/Discord/Apple), magic-link login, RBAC. Cookie mode is the recommended Next.js default.

- 1b5dec2: Add **two-factor authentication (TOTP)**.

  RFC 6238 TOTP implementation, built from the spec — zero dependencies, verified against the RFC 6238 Appendix B test vectors. Enable per-user via `setupTwoFactor` → `enableTwoFactor`. When 2FA is on for a user, `auth.login` returns a discriminated union — either the existing `{ user, token, refreshToken }` session or a `{ requires2FA: true, challengeToken }` challenge that the client passes back to `verifyTwoFactor` along with the user's 6-digit code.

  ```ts
  const result = await auth.login({ email, password });
  if ("requires2FA" in result) {
    // prompt user for TOTP code, then…
    const session = await auth.verifyTwoFactor(result.challengeToken, code);
  }
  ```

  Each enrollment also generates 10 single-use **recovery codes** (`xxxx-xxxx-xxxx` format, SHA-256 hashed at rest) for users who lose their authenticator device. Use one via `auth.useRecoveryCode(challengeToken, code)`.

  **HTTP routes** added on Express / Fastify / NestJS / Next.js:

  - `POST /auth/2fa/setup` (authed) → secret + otpauth URL + 10 recovery codes
  - `POST /auth/2fa/enable` (authed) → verifies first TOTP code, flips `twoFactorEnabled`
  - `POST /auth/2fa/disable` (authed, body `{ password }`) → password re-entry required
  - `POST /auth/2fa/verify` (public) → completes a 2FA-pending login with a TOTP code
  - `POST /auth/2fa/recovery` (public) → completes a 2FA-pending login with a recovery code

  **Client SDK** (`@authcore/core-web` + `@authcore/react`): `signIn` now returns `SignInResult<TUser>` (discriminated union). Added `setupTwoFactor`, `enableTwoFactor`, `disableTwoFactor`, `verifyTwoFactor`, `useRecoveryCode` to `useAuth()`.

  **Breaking** (custom DatabaseAdapter implementations): `User` interface gained `twoFactorEnabled: boolean` + `twoFactorSecret: string | null`. `TokenType` union gained `'RECOVERY_CODE'`. Apps using the Prisma adapter must `db:push` to add the new columns + enum value.

  **Breaking** (consumers of `auth.login`): return type is now `LoginResult = SessionResult | TwoFactorChallengeResult`. Existing code that destructures `{ user, token, refreshToken }` directly will fail to type-check until it handles the new shape. Runtime behavior is backward-compatible for users that have not enrolled 2FA.

  New `appName?: string` config option (defaults to `'AuthCore'`) — shown by authenticator apps as the issuer.

### Patch Changes

- Updated dependencies [4e9f453]
- Updated dependencies [7dc6db9]
- Updated dependencies [6b7cc5f]
- Updated dependencies [b860a7d]
- Updated dependencies [e6e1197]
- Updated dependencies [227b32b]
- Updated dependencies [347461a]
- Updated dependencies [7a2ab58]
- Updated dependencies [1b5dec2]
  - @authcore/types@0.12.0
  - @authcore/core@0.12.0
  - @authcore/core-web@0.12.0
  - @authcore/react@0.12.0
