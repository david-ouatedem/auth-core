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

Add **two-factor authentication (TOTP)**.

RFC 6238 TOTP implementation, built from the spec — zero dependencies, verified against the RFC 6238 Appendix B test vectors. Enable per-user via `setupTwoFactor` → `enableTwoFactor`. When 2FA is on for a user, `auth.login` returns a discriminated union — either the existing `{ user, token, refreshToken }` session or a `{ requires2FA: true, challengeToken }` challenge that the client passes back to `verifyTwoFactor` along with the user's 6-digit code.

```ts
const result = await auth.login({ email, password })
if ('requires2FA' in result) {
  // prompt user for TOTP code, then…
  const session = await auth.verifyTwoFactor(result.challengeToken, code)
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
