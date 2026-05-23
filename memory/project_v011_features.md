---
name: project-v011-features
description: AuthCore 0.11 ships OAuth 2.0 + PKCE (Google bundled, extensible) across all framework adapters + client SDK; also fixes the 0.10 Prisma REFRESH-enum regression
metadata:
  type: project
---

**AuthCore 0.11.0 (2026-05-23) — Production-readiness pass 2.**

Adds OAuth 2.0 + PKCE end-to-end. Fixes a 0.10 regression on the Prisma adapter. One additive breaking change for custom `DatabaseAdapter` implementations.

## What shipped

### 1. OAuth 2.0 + PKCE

- **Server**:
  - `createGoogleProvider({ clientId, clientSecret })` exported from `@authcore/core`.
  - `oauth?: Record<string, OAuthProvider>` on `AuthCoreConfig`.
  - `auth.oauthStart(providerId, redirectUri)` and `auth.oauthCallback(providerId, { code, state, redirectUri })`.
  - `GET /auth/oauth/:provider` + `GET /auth/oauth/:provider/callback` mounted by every framework adapter.
- **State envelope**: stateless. HMAC-signed with `session.secret`, carries `{ nonce, provider, codeVerifier, redirectUri, issuedAt }`. 10-minute TTL. No DB write at flow start.
- **Auto-link policy** (in `packages/core/src/features/oauth.ts:142-196`):
  - existing `OAuthAccount` → load user, refresh provider tokens
  - no account, no local user → create user with sentinel `passwordHash = '!OAUTH_NO_PASSWORD'`
  - no account, local user with provider-verified email → link
  - no account, local user with unverified email → throw `EMAIL_NOT_VERIFIED_BY_PROVIDER` (409)
- **Cookie mode**: 3-cookie pattern (JWT + refresh + optional CSRF) + redirect to `oauthSuccessRedirect`.
- **API mode**: returns `{ user, token, refreshToken }` JSON. When `oauthSuccessRedirect` is set, redirects with `#token=…&refreshToken=…` in fragment for SPA pickup.

### 2. Client SDK OAuth helpers

`@authcore/core-web` and `@authcore/react`:
- `oauthStartUrl(providerId)` — full URL builder.
- `signInWithProvider(providerId)` — `window.location.href = oauthStartUrl(providerId)`.
- `handleOAuthCallback()` — on landing page, reads URL fragment in api mode + fetches `/me` in both modes. Clears the fragment after.

### 3. Prisma OAuth model

```prisma
model OAuthAccount {
  id                String    @id @default(uuid())
  userId            String
  provider          String
  providerAccountId String
  accessToken       String
  refreshToken      String?
  expiresAt         DateTime?
  createdAt         DateTime  @default(now())
  updatedAt         DateTime  @updatedAt
  user              User      @relation(fields: [userId], references: [id], onDelete: Cascade)
  @@unique([provider, providerAccountId])
  @@index([userId])
}
```

User model gained `oauthAccounts OAuthAccount[]`. Adapter implements `findOAuthAccount`, `createOAuthAccount`, `updateOAuthAccount`.

### 4. 0.10 regression fix — REFRESH on Prisma

The 0.10 release added `REFRESH` to the TS `TokenType` union but **not** to the Prisma schema enum, and `toCoreTokenType()` in `packages/prisma-adapter/src/index.ts` threw on `REFRESH`. Refresh-token persistence on Prisma was broken end-to-end.

Fixed by adding `REFRESH` to the Prisma enum + accepting it in `toCoreTokenType`. Regression test in `packages/prisma-adapter/src/__tests__/prismaAdapter.integration.test.ts`.

Also dropped `OAUTH_STATE` from the TS `TokenType` union — the impl is purely stateless HMAC and `OAUTH_STATE` was never persisted, so keeping it in the enum was misleading.

## Breaking changes

- **Custom DatabaseAdapter implementations** must add `findOAuthAccount`, `createOAuthAccount`, `updateOAuthAccount`. Apps that don't set `config.oauth` never call these and can `throw` from them.
- Apps on Prisma must run `db:push` (or generate a migration) to add the `OAuthAccount` table and the new `REFRESH` enum value.

## Why this memory exists

When future sessions touch OAuth (adding GitHub/Microsoft providers, debugging callback flow, changing the auto-link policy):
- The state envelope is *stateless* — there's no `oauth_state` table to look at. Debug by decoding the base64url payload of the state.
- Email verification by the provider is **mandatory** for auto-linking. Don't soften this — it was an explicit security decision and it's what blocks account takeover via unverified-Gmail signup.
- The `OAUTH_NO_PASSWORD_SENTINEL = '!OAUTH_NO_PASSWORD'` is what marks OAuth-only users. To let them claim a password, route them through the standard forgot-password flow — it works because `resetPassword` doesn't care what the old hash was.
- The framework adapters are mirrored: Express/Fastify/NestJS all use the same 2-route pattern + same cookie pattern + same api-mode-redirect-with-fragment pattern. Any future provider (GitHub, Microsoft, Apple) plugs in via the `OAuthProvider` interface — no adapter changes needed.

## How to apply

- If the user asks about adding GitHub OAuth: point at `docs/security/oauth.md` "Adding a new provider" section and `packages/core/src/oauth/google.ts` as a reference.
- If the user reports OAuth-only users can't log in with password: that's expected; recommend the forgot-password flow as the "claim a password" path.
- If the user reports 401 from OAuth callback: most likely cause is `redirectUri` mismatch between the start request and the Google Cloud Console allowlist. Second most likely: clock skew making state appear expired.
- If the user wants to disable email-verified auto-linking: not supported. Add `manualLinkPolicy` only if there's a strong real-world request — the default exists to block a known attack class.

Linked: [[project-v010-features]] (the 0.10 baseline this builds on; especially the refresh-token + CSRF wiring that OAuth reuses), [[project-state-overview]] (11-package layout), [[feedback-docs-exhaustive]] (the docs sweep discipline applied here).
