---
name: project-state-overview
description: AuthCore monorepo structure as of 0.9 — 11 packages, framework adapters, React SDK, three example scaffolds, VitePress docs
metadata:
  type: project
---

AuthCore is a Devise-inspired, framework-agnostic auth library shipping as a pnpm monorepo with **11 npm packages** (not the 3 originally documented in CLAUDE.md before 0.9):

**Foundations**
- `@authcore/types` — single source of truth for `User`, `Token`, `PublicUser`, `DatabaseAdapter`, `EmailAdapter`, `AuthCoreConfig`, `SessionConfig` (now with `cookieName`). Zero runtime deps.
- `@authcore/core` — server core: `createAuth(config)` factory; bcryptjs, jsonwebtoken (HS256 only), zod. Exposes `auth.config` so framework adapters can read settings back.

**Backend adapters** (all wrap `createCoreAuth`)
- `@authcore/express` — router + middleware. Bearer or cookie via `useCookies: true`.
- `@authcore/fastify` — plugin + preHandler hooks.
- `@authcore/nestjs` — dynamic module + `AuthGuard`/`RolesGuard`/`AuthOptionalGuard` + `@CurrentUser`/`@Roles`/`@Public` decorators. **Express-platform only** for cookie mode.

**Frontend**
- `@authcore/core-web` — framework-agnostic web auth service; native fetch; `mode: 'api' | 'cookie'`; pluggable `httpClient` + `transformAuthResponse`/`transformUser`/`transformError`.
- `@authcore/react` — `AuthProvider`, `useAuth<TUser>()`, `useRole`/`useHasRole`, `ProtectedRoute`. `useSyncExternalStore` against `AuthWebService`.

**DB / email adapters**
- `@authcore/prisma-adapter` — typed against a `PrismaClientLike` structural interface; supports Prisma 5 and 6.
- `@authcore/resend-adapter` / `@authcore/nodemailer-adapter` — `EmailAdapter` implementations.

**Tooling**
- `create-authcore-app` — `@clack/prompts` CLI scaffolding three templates: `api-only` (Bearer), `monorepo` (cookies via Vite proxy), `frontend-only` (any backend).

**Examples**: three working apps under `examples/` mirroring the CLI templates.

**Docs**: VitePress site under `docs/` deployed to GitHub Pages — see [[project_docs_deployment]].

**Build order** (root `package.json`): `types → core → core-web → prisma-adapter → resend-adapter → nodemailer-adapter → express → fastify → nestjs → react → create-authcore-app`.

**Integration tests** use real Postgres on port 5433 via `docker-compose.yml`; gated on `DATABASE_URL` (skip gracefully when unset). Vitest runs `fileParallelism: false` + `singleFork: true` to avoid races on the shared DB.

**0.10 surface area (current):**
- Refresh tokens (always issued; rotated on every `/refresh`; revocable individually or all-for-user).
- CSRF synchronizer-token (opt-in via `session.csrf: true`; cookie mode only).
- Customizable email templates via `EmailConfig.templates`.
- New callbacks `onTokenRefresh` and `onFailedLogin`.
- New `DatabaseAdapter.deleteTokensByUserAndType` method (required for custom adapters).
See [[project-v010-features]] for details.

**Why this memory exists:** the project grew from 3 to 11 packages between 0.5 and 0.9 but CLAUDE.md wasn't refreshed in step. Future sessions should consult this overview before re-exploring the repo. CLAUDE.md was refreshed in 0.9 and 0.10.

**How to apply:** when answering questions about which package does what, package dependency order, where to add new code, or build/test commands — check here first instead of re-globbing the workspace.
