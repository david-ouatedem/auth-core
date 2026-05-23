# CLAUDE.md — AuthCore Project Memory

## What This Project Is

AuthCore is a Devise-inspired, framework-agnostic authentication library for the JS ecosystem.
It is a **pnpm monorepo** containing 11 npm packages plus three scaffold templates, a VitePress docs site, and three example apps.

## Package Dependency Graph

```
@authcore/types                (standalone — shared type definitions, no runtime deps)
    ↑
    ├── @authcore/core         (server core — bcryptjs, jsonwebtoken, zod)
    │       ↑
    │       ├── @authcore/prisma-adapter      (peerDep: @prisma/client)
    │       ├── @authcore/resend-adapter      (dep: resend)
    │       ├── @authcore/nodemailer-adapter  (dep: nodemailer)
    │       ├── @authcore/express             (peerDep: express)
    │       ├── @authcore/fastify             (peerDep: fastify, @fastify/cookie)
    │       └── @authcore/nestjs              (peerDeps: @nestjs/common, @nestjs/core, reflect-metadata)
    │
    └── @authcore/core-web     (framework-agnostic web auth service, native fetch only)
            ↑
            └── @authcore/react                (peerDep: react ^18 || ^19)

create-authcore-app           (CLI scaffolder; standalone)
```

## Project Structure

```
auth-core/
├── packages/
│   ├── types/              @authcore/types — User, Token, adapter interfaces, AuthCoreConfig, SessionConfig
│   ├── core/               @authcore/core — createAuth factory, features (emailVerification, passwordReset, invitation)
│   ├── core-web/           @authcore/core-web — AuthWebService class for browser auth (api/cookie modes)
│   ├── prisma-adapter/     @authcore/prisma-adapter — Prisma DatabaseAdapter (supports Prisma 5 and 6)
│   ├── resend-adapter/     @authcore/resend-adapter — Resend EmailAdapter
│   ├── nodemailer-adapter/ @authcore/nodemailer-adapter — SMTP EmailAdapter via nodemailer
│   ├── express/            @authcore/express — Express Router + middleware (Bearer or cookie)
│   ├── fastify/            @authcore/fastify — Fastify plugin + preHandler hooks
│   ├── nestjs/             @authcore/nestjs — Dynamic module, AuthGuard, RolesGuard, decorators
│   ├── react/              @authcore/react — AuthProvider, useAuth, ProtectedRoute, useRole/useHasRole
│   └── create-authcore-app/ CLI: scaffolds api-only, monorepo, or frontend-only templates
├── docs/                   VitePress site (deployed to GitHub Pages)
├── examples/               api-only, monorepo, frontend-only working apps
├── memory/                 Project-local Claude memory (MEMORY.md + topic files)
├── pnpm-workspace.yaml
├── tsconfig.base.json      Shared strict TS config (ES2022, NodeNext)
├── vitest.config.ts        Workspace vitest, fileParallelism: false + singleFork (shared Postgres)
├── docker-compose.yml      Postgres 16 on port 5433 for integration tests
├── .env.example            DATABASE_URL + AUTH_SECRET
├── CLAUDE.md               This file
└── BUILD_LOG.md            Step-by-step build journal (historical)
```

## Key Architectural Decisions

- **Zero framework deps in @authcore/core and @authcore/core-web** — they stay portable and testable in isolation.
- **`@authcore/types` is the single source of truth** for User/Token/Adapter/Config shapes. Both server and browser packages depend on it; the browser side never pulls bcryptjs/jsonwebtoken/zod.
- **Cookie name lives under `SessionConfig.cookieName`** (single source of truth). Framework routers and middleware/guards all read it via `auth.config.session.cookieName`. Per-router overrides exist for backward compatibility.
- **Passwords**: bcryptjs with ≥12 rounds (silently clamped from below), never logged.
- **Tokens**: 32 random bytes → SHA-256 hashed before DB storage; raw token returned to user once.
- **Timing-safe comparison**: `crypto.timingSafeEqual` for the explicit token-compare helper.
- **Forgot password always returns 200** — prevents email enumeration. **Reset URL is now passed by framework adapters**; core throws `MISSING_URL` (500) if a direct caller forgets it (security regression fix in 0.7).
- **JWT HS256 only**, payload carries `{ sub, email, role }` so RBAC checks need no DB hit.
- **Zod** for all input validation.
- **Integration tests** use real Postgres via Docker — port 5433. They skip gracefully when `DATABASE_URL` is unset.

## Features

| Feature | Enabled via | TTL | Effect |
|---------|-------------|-----|--------|
| `emailVerification` | `features: ['emailVerification']` | 24h | Login blocks unverified users; adds `/verify-email` |
| `passwordReset`     | `features: ['passwordReset']`     | 1h  | Adds `/forgot-password`, `/reset-password` |
| `invitation`        | `features: ['invitation']`        | 48h | Authenticated users can invite others by email + role |
| RBAC                | `rbac.defaultRole: 'user'` (default) | n/a | `role` field on User, included in JWT |
| Refresh tokens      | Always on (0.10+)                 | 30d | `/refresh`, `/revoke` routes; rotated on every use; `auth.revokeAll(userId)` for log-out-everywhere |
| CSRF (cookie mode)  | `session.csrf: true` (opt-in)     | n/a | Synchronizer token cookie + `X-CSRF-Token` header on state-changing requests |
| Email templates     | `email.templates: { ... }`        | n/a | Per-feature render functions; defaults preserved when unset |

## Commands to Resume Work

```bash
# Install all deps
pnpm install

# Build all packages (types → core/core-web → adapters → frameworks → react → cli)
pnpm -w run build

# Run all tests (unit + integration; integration skips if no DB)
pnpm -w run test

# Run tests for a specific package
pnpm --filter @authcore/core test
pnpm --filter @authcore/prisma-adapter test
pnpm --filter @authcore/express test
pnpm --filter @authcore/fastify test
pnpm --filter @authcore/nestjs test
pnpm --filter @authcore/react test

# Start Postgres for integration tests
docker compose up -d
pnpm --filter @authcore/prisma-adapter db:push

# Stop Postgres
docker compose down

# Docs site
pnpm docs:dev    # local preview
pnpm docs:build  # production build for Pages
```

## Environment Setup

```bash
cp .env.example .env
# Edit .env with real DATABASE_URL and AUTH_SECRET (≥32 chars)
```

## Testing Rules (Always Follow These)

- **Every code change must be accompanied by tests.** New features get new tests; bug fixes get a regression test; refactors must keep existing tests green.
- Add tests to the existing test file for the package being changed. Do not create standalone test files unless a test file doesn't exist yet.
- For tests that send emails, **use the inlined `createCaptureEmail()` helper** at the top of each framework integration test file (Express/Fastify/NestJS). It captures the outgoing email so you can assert URL content. A canonical version lives at `packages/core/src/__tests__/helpers/captureEmailAdapter.ts` for core unit tests. **Don't try to import test helpers across packages** — the `@authcore/core` package's `exports` field doesn't allow deep-imports into `__tests__/`. Just copy the ~10-line capture function inline.
- Run the affected package's tests after writing them (`pnpm --filter <package> test --run`) and confirm all pass before considering the task done.

## Security Rules (Never Break These)

1. Passwords hashed with bcryptjs ≥12 rounds (silent clamp from below), never stored or logged plain.
2. Tokens: random, hashed before storage, raw value returned to user only once.
3. Token comparison: always `crypto.timingSafeEqual`.
4. Forgot password: always return 200.
5. **Never embed `session.secret` or any other secret in URLs, email bodies, logs, or error messages.** Reset/verify/invite URLs come from `baseUrl + paths.*` in the framework router; core throws if a caller forgets to supply one.
6. All inputs validated with Zod before any processing.
7. Token TTLs: password reset 1h, email verification 24h, invitation 48h.

## Adding a New Database Adapter

Implement `DatabaseAdapter` from `@authcore/types`:

```ts
import type { DatabaseAdapter } from '@authcore/types'

export function myDbAdapter(client: MyDbClient): DatabaseAdapter {
  return {
    findUserByEmail: async (email) => { ... },
    findUserById: async (id) => { ... },
    createUser: async (data) => { ... },
    updateUser: async (id, data) => { ... },
    createToken: async (data) => { ... },
    findToken: async (token, type) => { ... },
    deleteToken: async (id) => { ... },
    deleteExpiredTokens: async () => { ... },
  }
}
```

`findToken` MUST hash the raw token (SHA-256) before querying the DB — see `packages/prisma-adapter/src/index.ts:65-69`.

## Adding a New Email Adapter

```ts
import type { EmailAdapter } from '@authcore/types'

export function myEmailAdapter(config: MyConfig): EmailAdapter {
  return {
    send: async ({ from, to, subject, html, text }) => { ... },
  }
}
```

## Adding a New Framework Adapter

Wrap `createAuth` from `@authcore/core`. Your adapter should:

1. Accept `AuthCoreConfig` and create a core instance via `createCoreAuth(config)`.
2. Read `core.config.session.cookieName` (with `'authcore_token'` default) and thread it into BOTH the cookie writer (route handlers) AND the cookie reader (middleware/guards). Mismatched names = guaranteed 401 loop — see the 0.9 bug fix.
3. Build `resetUrl` as `${baseUrl}${paths.resetPassword}` and pass it as `auth.forgotPassword(body, { resetUrl })`. Same pattern for invite (`inviteUrl`).
4. Register the **`POST /refresh` and `POST /revoke`** routes (added in 0.10). Reads refresh token from body OR cookie (`${cookieName}_refresh`). Logout should also revoke server-side.
5. If `session.csrf` is true AND cookie mode is on, set the `${cookieName}_csrf` cookie (NOT httpOnly) on every successful auth response. Add a CSRF check (header `X-CSRF-Token` matches cookie) on state-changing requests. Skip GET/HEAD/OPTIONS.
6. Map `AuthError` to the framework's HTTP error type (401 for missing/invalid auth, 403 for role denial or CSRF mismatch).
7. Expose `requireRole(...roles)` for RBAC checks after the auth middleware/guard.

When in cookie mode, set THREE cookies on successful auth: `${cookieName}` (httpOnly JWT), `${cookieName}_refresh` (httpOnly refresh), and `${cookieName}_csrf` (NOT httpOnly, only when `session.csrf: true`).
