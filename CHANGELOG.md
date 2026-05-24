# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.11.0] - 2026-05-23

Production-readiness pass 2 — adds OAuth (Google + extensible provider interface) and fixes a 0.10 regression on the Prisma adapter.

### Added

- **OAuth 2.0 + PKCE.**
  - `oauth?: Record<string, OAuthProvider>` on `AuthCoreConfig` registers providers by id.
  - `createGoogleProvider({ clientId, clientSecret })` exported from `@authcore/core`. Other providers are a ~80-line `OAuthProvider` implementation away (`exchangeCode`, `getUserInfo`, `authorize`).
  - New core methods: `auth.oauthStart(providerId, redirectUri)` and `auth.oauthCallback(providerId, { code, state, redirectUri })`.
  - New routes mounted by every framework adapter:
    - `GET /auth/oauth/:provider` — redirects to provider authorization URL.
    - `GET /auth/oauth/:provider/callback` — verifies state, exchanges code, mints session.
  - **Stateless HMAC-signed state envelope** (no DB write at flow start). 10-minute TTL. Carries nonce, provider id, PKCE verifier, and redirectUri.
  - **Auto-link policy**: existing OAuth account → load user; no account + no local user → create new user (sentinel password hash); no account + local user with provider-verified email → link; no account + local user with unverified email → `EMAIL_NOT_VERIFIED_BY_PROVIDER` (409).
  - **Cookie mode** sets the standard 3 cookies (JWT + refresh + optional CSRF) and redirects to `oauthSuccessRedirect`.
  - **API mode** returns `{ user, token, refreshToken }` JSON, or — when `oauthSuccessRedirect` is set — redirects to that URL with `#token=…&refreshToken=…` for SPA pickup.
  - New `OAuthAccount` model in `@authcore/prisma-adapter` (unique on `(provider, providerAccountId)`, cascade on user delete). New methods on `DatabaseAdapter`: `findOAuthAccount`, `createOAuthAccount`, `updateOAuthAccount`.

- **Client-side OAuth helpers** in `@authcore/core-web` and `@authcore/react`:
  - `oauthStartUrl(providerId)` — builds the full URL.
  - `signInWithProvider(providerId)` — `window.location.href = oauthStartUrl(providerId)`.
  - `handleOAuthCallback()` — on the SPA landing page, reads the URL fragment in api mode + fetches `/me` in both modes.
  - `useAuth()` exposes all three.

- **New error codes** on OAuth flows: `OAUTH_PROVIDER_UNKNOWN` (400), `OAUTH_EXCHANGE_FAILED` (502), `OAUTH_USERINFO_FAILED` (502), `EMAIL_NOT_VERIFIED_BY_PROVIDER` (409).

- **Documentation**:
  - New `docs/security/oauth.md` covering server setup, client integration, Google client config, and adding new providers.
  - VitePress sidebar now exposes the **Security** section (previously missing — `refresh-tokens.md`, `csrf.md`, `email-templates.md` from 0.10 were orphaned).

### Fixed

- **`REFRESH` tokens on Prisma (0.10 regression).** The 0.10 release added `REFRESH` to the TS `TokenType` union but the Prisma schema enum lacked it, and `toCoreTokenType()` threw on it. Apps using the Prisma adapter couldn't actually use refresh tokens. Now fixed: Prisma enum updated, `toCoreTokenType` updated, regression test added in `prismaAdapter.integration.test.ts`.

### Changed

- Custom database adapters must implement three new methods: `findOAuthAccount`, `createOAuthAccount`, `updateOAuthAccount`. Apps not using OAuth (no `config.oauth` set) never call these and can leave them as `async () => { throw new Error('OAuth not configured') }` if desired.
- Default route paths for OAuth: `/oauth/:provider` and `/oauth/:provider/callback`. Override via `routes.oauth` / `routes.oauthCallback` on Express/Fastify config or via NestJS module options.

### Notes for upgraders

- Run `pnpm --filter @authcore/prisma-adapter db:push` (or generate a migration) to add the `OAuthAccount` table and the new `REFRESH` enum value.
- If you maintain a custom `DatabaseAdapter`, add the three OAuth methods. They're optional if you never set `config.oauth`.

## [0.10.0] - 2026-05-22

Production-readiness pass 1. Three opt-in features layered on top of 0.9; no breaking changes for apps using framework adapters.

### Added

- **Customizable email templates.** New `EmailConfig.templates` option lets you override `verifyEmail`, `resetPassword`, and `invitation` emails with `(ctx) => { subject, html, text }` render functions. Defaults preserved when not set. See `docs/security/email-templates.md`.
- **Refresh tokens + session revocation.**
  - `register`, `login`, `acceptInvitation`, and `refresh` all return `{ user, token, refreshToken }`.
  - New `auth.refresh(rawRefreshToken)` rotates the refresh token and re-issues the JWT.
  - New `auth.revoke(rawRefreshToken)` and `auth.revokeAll(userId)` for single-session and global revocation.
  - New `POST /auth/refresh` and `POST /auth/revoke` routes in Express, Fastify, and NestJS.
  - `POST /auth/logout` now also revokes the refresh token server-side.
  - In cookie mode, the refresh token is stored as an httpOnly cookie `${cookieName}_refresh`.
  - New `SessionConfig.refreshExpiresIn` (default `'30d'`).
  - `Token.REFRESH` is now a real token type in the enum.
- **CSRF synchronizer-token protection (opt-in).**
  - `SessionConfig.csrf: true` enables it. Off by default.
  - When enabled + `useCookies: true`, register/login/refresh/accept-invitation set a non-httpOnly `${cookieName}_csrf` cookie.
  - Express middleware, Fastify hook, and new `CsrfGuard` in NestJS check `X-CSRF-Token` header on POST/PUT/PATCH/DELETE.
  - `@authcore/core-web` automatically reads the cookie via `document.cookie` and sends the header on state-changing requests.
- **New callbacks.**
  - `AuthCallbacks.onTokenRefresh(user)` — fires after every successful refresh.
  - `AuthCallbacks.onFailedLogin(email, reason)` — fires on invalid credentials or unverified email (foundation for rate-limiting / lockout in user code).
- **`DatabaseAdapter.deleteTokensByUserAndType`** — required new method; powers `auth.revokeAll`.
- Default templates exported from `@authcore/core` as `defaultVerifyEmailTemplate`, `defaultResetPasswordTemplate`, `defaultInvitationTemplate` for users that want to extend rather than replace.
- `generateCsrfToken()` utility exported from `@authcore/core`.

### Changed

- **Backward-compatible**: `register`/`login`/`acceptInvitation` return shapes gained a `refreshToken` field. Existing clients that destructure only `user` and `token` continue to work.
- `@authcore/react` `useAuth()` exposes two new actions: `refresh()` and `revokeSession()`.

### Notes

- Custom database adapters MUST implement `deleteTokensByUserAndType` (one method, three lines for most ORMs).
- Existing apps that don't enable `session.csrf` see zero behavior changes.
- Apps that don't pass `email.templates` get the same email bodies as 0.9.

## [0.9.0] - 2026-05-22

### Security

- **`forgotPassword` no longer leaks `AUTH_SECRET` into reset emails.** Affected: every release that enabled the `passwordReset` feature since 0.5.0. The old code did `resetUrl: \`${session.secret}/reset-password\`` with a misleading "overridden by framework adapter" comment that no adapter actually honored — outbound emails contained the JWT signing secret in plain text. **Strongly recommend rotating `AUTH_SECRET` for any deployment that ran 0.5.x–0.8.x with `passwordReset` enabled.** Any JWTs minted with the leaked secret should be considered compromised.

### Added

- `SessionConfig.cookieName` — single source of truth for the auth cookie name, read by routers AND middleware/guards across Express, Fastify, and NestJS. Defaults to `'authcore_token'`.
- `AuthCore.config` — the resolved config is now exposed on the returned auth instance so framework adapters can plumb settings through without re-importing.
- **NestJS cookie support** — `AuthModule.register({ useCookies: true })` now sets/clears httpOnly cookies on register/login/logout/accept-invitation. Guards read cookies as a fallback when no Bearer header is present. Requires `@nestjs/platform-express` + `cookie-parser` middleware.
- Integration tests for password reset, email verification, invite + accept-invitation, cookie-mode round trip, custom `cookieName`, and `requireRole`/`RolesGuard` happy paths across all three framework adapters.
- `packages/core/src/__tests__/helpers/captureEmailAdapter.ts` — shared capture-email helper for core unit tests (each framework integration test inlines an equivalent ~10-line helper).

### Changed

- **BREAKING (direct-core callers only)**: `auth.forgotPassword(input)` is now `auth.forgotPassword(input, { resetUrl })`. The framework adapters always supply `resetUrl` built from their `baseUrl + paths.resetPassword`, so apps using `@authcore/express`/`fastify`/`nestjs` are unaffected. Apps calling `createAuth()` from `@authcore/core` directly must add the second argument or `forgotPassword` will throw `AuthError('resetUrl is required', 'MISSING_URL', 500)`.
- **NestJS guards now throw `UnauthorizedException` (401)** for missing/invalid auth instead of returning `false` (which Nest mapped to 403). `RolesGuard` still correctly throws `ForbiddenException` (403). Brings NestJS in line with Express/Fastify.

### Fixed

- **Cookie-name customization now works end-to-end in Express and Fastify.** Before 0.9, setting `cookieName: 'foo'` on `router()`/`plugin()` caused login to write `foo` but the middleware/hook to read `'authcore_token'`, producing a permanent 401 loop on `/me` and any user-protected route. Both adapters now resolve `cookieName` from `auth.config.session.cookieName` for both the writer and the reader.

### Removed

- `AuthCoreConfig.mode` (the `'api' | 'monorepo' | 'auto'` field) — dead type with zero readers in any package, doc, or template.

## [0.6.0] - 2026-03-23

### Added

- **@authcore/nestjs**: NestJS adapter with `AuthModule.register()`, guards (`AuthGuard`, `AuthOptionalGuard`, `RolesGuard`), and decorators (`@CurrentUser`, `@Roles`, `@Public`)
- **RBAC**: Role-based access control across all packages. Every user gets a `role` field (default `'user'`), included in the JWT payload.
- **Invitation system**: `invite()` and `acceptInvitation()` methods. Authenticated users can invite new users by email with a pre-assigned role.
- `requireRole()` middleware for Express and Fastify
- `useRole()` and `useHasRole()` hooks for React
- GitHub Actions CI pipeline (Node 18/20/22 with Postgres)
- Open-source community files: CONTRIBUTING.md, SECURITY.md, CODE_OF_CONDUCT.md, issue/PR templates

### Fixed

- Integration test dotenv path resolution (now resolves from workspace root)
- Vitest `fileParallelism: false` to prevent DB conflicts between test files
- NestJS guard DI: explicit `@Inject(Reflector)` for esbuild compatibility
- CI uses workspace-local Prisma binary to avoid version mismatch

## [0.5.4] - 2026-03-20

### Added

- **@authcore/nestjs**: NestJS adapter with `AuthModule.register()`, guards (`AuthGuard`, `AuthOptionalGuard`, `RolesGuard`), and decorators (`@CurrentUser`, `@Roles`, `@Public`)
- **RBAC**: Role-based access control across all packages. Every user gets a `role` field (default `'user'`), included in the JWT payload.
- **Invitation system**: `invite()` and `acceptInvitation()` methods. Authenticated users can invite new users by email with a pre-assigned role.
- `requireRole()` middleware for Express and Fastify
- `useRole()` and `useHasRole()` hooks for React
- Integration tests for NestJS adapter

### Fixed

- Integration test dotenv path resolution (now resolves from workspace root)
- Vitest `fileParallelism: false` to prevent DB conflicts between test files

## [0.5.3] - 2026-03-15

### Added

- **@authcore/fastify**: Fastify plugin with `authRequired()` and `authOptional()` hooks
- **@authcore/react**: React SDK with `AuthProvider`, `useAuth`, and `ProtectedRoute`
- **create-authcore-app**: CLI scaffolding tool with API-only, frontend-only, and monorepo templates
- VitePress documentation site

## [0.5.0] - 2026-03-10

### Added

- **@authcore/core**: Framework-agnostic auth logic with registration, login, logout, email verification, and password reset
- **@authcore/prisma-adapter**: Prisma database adapter
- **@authcore/express**: Express router and middleware
- **@authcore/resend-adapter**: Resend email adapter
- **@authcore/nodemailer-adapter**: Nodemailer email adapter
