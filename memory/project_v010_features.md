---
name: project-v010-features
description: AuthCore 0.10 ships three opt-in production-readiness features — customizable email templates, refresh tokens with rotation + revocation, and CSRF synchronizer-token protection; all backward-compatible
metadata:
  type: project
---

**AuthCore 0.10.0 (2026-05-22) — Production-readiness pass 1.**

Three opt-in features layered on the 0.9 architecture. Zero breaking changes for apps using framework adapters; one minor breaking change for direct-core callers of the database adapter (new method required).

## What shipped

1. **Customizable email templates** (`EmailConfig.templates`).
   - Per-feature render functions: `verifyEmail`, `resetPassword`, `invitation`.
   - Signature: `(ctx) => { subject, html, text }` — `ctx` includes `email`, `link`, `ttlHours`, plus `role` for invitations.
   - Defaults preserved when not overridden — same email bodies as 0.9.
   - Defaults also exported as `defaultVerifyEmailTemplate` etc. for `...spread` extension.

2. **Refresh tokens + session revocation.**
   - `Token.REFRESH` is now a real token type.
   - `register` / `login` / `acceptInvitation` / `refresh` all return `{ user, token, refreshToken }`.
   - New `auth.refresh(rawToken)` rotates the refresh token (delete old + issue new).
   - New `auth.revoke(rawToken)` and `auth.revokeAll(userId)`.
   - New routes: `POST /auth/refresh`, `POST /auth/revoke`.
   - `POST /auth/logout` now also revokes the refresh token server-side.
   - Cookie mode: refresh token stored as httpOnly cookie `${cookieName}_refresh`.
   - `SessionConfig.refreshExpiresIn` defaults to `'30d'`.

3. **CSRF synchronizer token (opt-in, cookie mode).**
   - `SessionConfig.csrf: true` enables it. Default false.
   - Sets non-httpOnly `${cookieName}_csrf` cookie on register/login/refresh/accept-invitation.
   - State-changing requests (POST/PUT/PATCH/DELETE) must echo cookie value as `X-CSRF-Token` header.
   - Safe methods (GET/HEAD/OPTIONS) and the first pre-login request are exempt.
   - `@authcore/core-web` auto-reads `document.cookie` and sets the header on outbound state-changing requests.
   - NestJS gets a new `CsrfGuard` — wire globally in `main.ts` via `app.useGlobalGuards(app.get(CsrfGuard))`.

4. **New callbacks** for production observability:
   - `onTokenRefresh(user)` — fires after every refresh.
   - `onFailedLogin(email, reason)` — `'INVALID_CREDENTIALS' | 'EMAIL_NOT_VERIFIED'`. Wire to rate limiter.

## Breaking changes

- **`DatabaseAdapter.deleteTokensByUserAndType(userId, type)` is required.** Three-line implementation in any ORM (Prisma adapter ships it). Custom adapters must add this method. Powers `auth.revokeAll`.

## Why this memory exists

When future sessions touch refresh-token logic, CSRF wiring, or email-template plumbing they should know:
- The patterns are deliberately mirrored across all three framework adapters (Express, Fastify, NestJS). Add new framework adapters by following the same shape.
- The client SDK (`@authcore/core-web` / `@authcore/react`) handles refresh rotation and CSRF auto-headers transparently — apps don't need to wire anything.
- Templates are intentionally `(ctx) => ({...})` functions rather than file paths or a templating engine — keeps the library dependency-free.

## How to apply

- If the user asks about adding rate limiting / lockout: point at `callbacks.onFailedLogin` as the hook surface; AuthCore deliberately doesn't ship rate limiting.
- If they ask about token revocation: `auth.revokeAll(userId)` in `callbacks.onPasswordReset` is a recommended pattern.
- If they ask about NestJS CSRF setup: it requires `cookie-parser` in `main.ts` AND `app.useGlobalGuards(app.get(CsrfGuard))` — both pieces are needed.
- If they ask about email i18n: render functions can be `async`, so they can `await` a locale lookup before branching.

Linked: [[project-state-overview]] (now updated with refresh/CSRF features), [[project-v09-security-fix]] (the 0.9 baseline this builds on), [[feedback-docs-exhaustive]] (the docs discipline applied here).
