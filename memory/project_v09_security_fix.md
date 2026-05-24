---
name: project-v09-security-fix
description: AuthCore 0.9 ships a critical security fix (AUTH_SECRET leak in reset emails) plus cookieName threading + NestJS 401/cookie support; affected-version advisory for 0.5.x–0.8.x
metadata:
  type: project
---

**AuthCore 0.9.0 (2026-05-22) shipped four fixes worth remembering:**

1. **CRITICAL — `forgotPassword` no longer leaks `AUTH_SECRET` into reset emails.** Pre-0.9, `packages/core/src/auth.ts:282` did `resetUrl: \`${session.secret}/reset-password\`` with a false "overridden by framework adapter" comment. Reset emails actually contained the JWT signing secret. **Any deployment that ran 0.5.0–0.8.x with `passwordReset` enabled MUST rotate `AUTH_SECRET`** — all JWTs minted with the old secret are compromised. See `SECURITY.md` Known Past Issues.
2. **Cookie name threading** — `SessionConfig.cookieName` is now the single source of truth across all framework adapters. Pre-0.9, setting `cookieName: 'foo'` on `router()`/`plugin()` only changed the write path; middleware/hooks read `'authcore_token'`. Custom cookie names caused permanent 401 loops.
3. **NestJS guards throw `UnauthorizedException` (401)** instead of returning `false` (which Nest mapped to 403). Brings NestJS in line with Express/Fastify for missing/invalid-token paths. `RolesGuard` still 403.
4. **NestJS cookie support** — `AuthModule.register({ useCookies: true })` now sets/clears cookies. Requires `@nestjs/platform-express` + `cookie-parser` in `main.ts`.

**Breaking change (direct-core callers only):** `auth.forgotPassword(input)` is now `auth.forgotPassword(input, { resetUrl })`. Throws `AuthError('resetUrl is required', 'MISSING_URL', 500)` if missing. Framework adapter users are unaffected.

**Removed:** `AuthCoreConfig.mode` (dead field, zero readers).

**Why this memory exists:** the secret leak in particular has user-impacting deployment consequences — when anyone asks about AuthCore version compatibility, upgrade paths, or weird old reset-email URLs, surface this. The cookieName / NestJS 401 changes are smaller but they affect any code that relied on the broken-but-working defaults.

**How to apply:**
- If the user mentions reset-email issues or AuthCore upgrade — point them at the SECURITY.md "Known Past Issues" section and the rotation guidance.
- If the user references `auth.forgotPassword(body)` (one-arg form) in code — flag that this changed in 0.9 and they need `{ resetUrl }`.
- If the user has NestJS code that expected 403 on missing auth — that's now 401.

Linked: [[feedback-docs-exhaustive]] (the 0.9 docs sweep that confirmed this changelog), [[project-state-overview]] (current 11-package layout post-0.9).
