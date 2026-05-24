# @authcore/nodemailer-adapter

## 0.12.0

### Minor Changes

- 4e9f453: Add `createAppleProvider` — Sign in with Apple via OAuth 2.0 + PKCE.

  Apple's `client_secret` is not a static string: it's an ES256-signed JWT minted on each token exchange. AuthCore handles that for you — provide the four config fields (Services ID, Team ID, Key ID, and the `.p8` private key contents):

  ```ts
  import { createAppleProvider } from '@authcore/core'

  const apple = createAppleProvider({
    clientId: 'com.example.myapp.service',
    teamId: 'ABC1234DEF',
    keyId: 'XYZ9876ABC',
    privateKey: process.env.APPLE_PRIVATE_KEY!,
  })

  createAuth({ ..., oauth: { apple } })
  ```

  Uses `response_mode=query` (vs. Apple's default `form_post`) so the existing AuthCore callback route handles the response without body-parser changes. Mounted automatically at `GET /auth/oauth/apple` + `/callback`. The `generateAppleClientSecret` helper is also exported for users who want to mint the JWT outside the provider flow.

- 7dc6db9: Add `createDiscordProvider` — sign in with Discord via OAuth 2.0 + PKCE.

  ```ts
  import { createDiscordProvider } from '@authcore/core'

  const discord = createDiscordProvider({
    clientId: process.env.DISCORD_CLIENT_ID!,
    clientSecret: process.env.DISCORD_CLIENT_SECRET!,
  })

  createAuth({ ..., oauth: { discord } })
  ```

  Threads Discord's `verified` flag through to `emailVerified` — unverified Discord users hit the standard `EMAIL_NOT_VERIFIED_BY_PROVIDER` gate when linking to an existing local account. Mounted automatically at `GET /auth/oauth/discord` + `/callback`.

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

- b860a7d: Add `createGithubProvider` — sign in with GitHub via OAuth 2.0 + PKCE.

  ```ts
  import { createGithubProvider } from '@authcore/core'

  const github = createGithubProvider({
    clientId: process.env.GITHUB_CLIENT_ID!,
    clientSecret: process.env.GITHUB_CLIENT_SECRET!,
  })

  createAuth({ ..., oauth: { google, github } })
  ```

  Always uses the user's **verified primary** email (refuses login when no verified email exists). Supports GitHub Enterprise Server via the optional `enterpriseBaseUrl` config. Mounted automatically at `GET /auth/oauth/github` + `/callback` by every framework adapter.

- e6e1197: Add passwordless **magic-link login**. Enable via `features: ['magicLink']`.

  ```ts
  const auth = createAuth({
    db: prismaAdapter(prisma),
    session: { strategy: 'jwt', secret: process.env.AUTH_SECRET! },
    features: ['magicLink'],
    email: { provider: resendAdapter(...), from: 'auth@app.com' },
  })
  ```

  Two new HTTP routes mounted by every framework adapter:

  - `POST /auth/magic-link` — body `{ email }`. Always returns 200 (enumeration-safe). Auto-creates a user if none exists (with `emailVerified: true`, since receiving the link in the inbox proves ownership).
  - `GET /auth/magic-link/consume?token=…` — single-use exchange. Mints a JWT + refresh token. Cookie mode sets the standard 3 cookies and redirects to `magicLinkSuccessRedirect`; api mode returns JSON or redirects with `#token=…&refreshToken=…` if `magicLinkSuccessRedirect` is set.

  Client SDK additions:

  - `signInWithMagicLink(email)` on `useAuth()` — sends the magic-link email.
  - `handleMagicLinkCallback()` on `useAuth()` — call on your landing page. Handles three cases: `?token=…` direct click (calls the consume endpoint), `#token=…` fragment redirect (api mode), cookie-mode redirect (fetches `/me`).

  Custom email body via `email.templates.magicLink`. Default `defaultMagicLinkTemplate` is also exported. New `Token.MAGIC_LINK` type added — Prisma users need to `db:push` to add the enum value.

- 227b32b: Add `createMicrosoftProvider` — sign in with Microsoft / Entra ID via OAuth 2.0 + PKCE.

  ```ts
  import { createMicrosoftProvider } from '@authcore/core'

  const microsoft = createMicrosoftProvider({
    clientId: process.env.MICROSOFT_CLIENT_ID!,
    clientSecret: process.env.MICROSOFT_CLIENT_SECRET!,
    // tenant: 'common' | 'organizations' | 'consumers' | '<tenant-id>'
  })

  createAuth({ ..., oauth: { microsoft } })
  ```

  Reads identity claims (`sub`, `email`, `name`) directly from the OpenID Connect id_token — no extra Microsoft Graph call when the id_token is present. Falls back to `/me` when needed. Mounted automatically at `GET /auth/oauth/microsoft` + `/callback`.

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
- Updated dependencies [1b5dec2]
  - @authcore/types@0.12.0
