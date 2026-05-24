# AuthCore Threat Model

This document is the security spec for AuthCore. It enumerates what AuthCore defends against, what's explicitly out of scope, and the cryptographic primitives in use. It's deliberately blunt — you can't build something secure on top of a library whose security promises are vague.

If you find a discrepancy between this document and the code, **the discrepancy itself is a security bug**. Report it via the channel in [`SECURITY.md`](https://github.com/david-ouatedem/auth-core/blob/main/SECURITY.md).

## Audience

- **Security reviewers**: this is the entry point. Each section names the file paths to inspect.
- **App developers**: read the [Out of scope](#out-of-scope) section before you ship. The things AuthCore does NOT defend against are still your problem.
- **Compliance teams**: see [Cryptographic primitives](#cryptographic-primitives) for the algorithm + parameter inventory.

## Assets

What we're protecting, in order of damage if compromised:

| Asset | Compromise impact |
|---|---|
| **`session.secret` (AUTH_SECRET env var)** | Total breach: an attacker can forge any session JWT, decrypt any OAuth state envelope, mint 2FA challenge tokens. Rotation invalidates all live sessions. |
| **User password hashes** | Offline brute force against bcryptjs ≥12 rounds. Per-user cost is high but not infinite. |
| **TOTP secrets** | Allows generating valid 2FA codes for a user. Stored plaintext (see [Known tradeoffs](#known-tradeoffs)). |
| **Refresh token hashes** | Stored SHA-256 hashed; the raw token grants `auth.refresh()` for the remaining TTL. |
| **OAuth provider tokens** (access + refresh) | Stored plaintext on `oauth_accounts`. Compromise lets the attacker act as the user against Google/GitHub/etc. |
| **Recovery code hashes** | Stored SHA-256 hashed. Each is single-use; consumption deletes the row. |
| **In-flight magic-link tokens / reset tokens / verify-email tokens** | Stored hashed, 15-min to 24-hr TTL depending on type. Lets an attacker who intercepts the email take over the account. |

## Trust boundaries

```
┌─────────────────────────────────────────────────────────────────┐
│                      DB at rest                                  │
│        (passwords hashed, tokens hashed, secrets plain)          │
└─────────────────────────────────────────────────────────────────┘
                              │
                       TRUST BOUNDARY
                              │
┌─────────────────────────────▼───────────────────────────────────┐
│                       AuthCore server code                       │
│         (Node runtime, has access to AUTH_SECRET)                │
└─────────────────────────────────────────────────────────────────┘
                              │
                  TLS  ──── TRUST BOUNDARY ────  TLS
                              │
┌─────────────────────────────▼───────────────────────────────────┐
│                       Browser / client                           │
│       (holds JWT in httpOnly cookie or localStorage)             │
└─────────────────────────────────────────────────────────────────┘
                              │
                       TRUST BOUNDARY
                              │
                    The user's eyeballs + device
```

AuthCore is the perimeter between the DB and the wire. The DB is assumed semi-trusted (we hash secrets that go in, but we read non-secrets back as plain). The wire is assumed hostile — everything that leaves AuthCore goes through TLS, and tokens are short-lived + hashed-before-storage.

## Threats and mitigations

Indexed roughly by attack vector. File paths point at the implementation if you want to verify.

### Password attacks

| Threat | Mitigation |
|---|---|
| **Offline brute force on DB dump** | `bcryptjs` with ≥12 rounds (silently clamped — `packages/core/src/utils/password.ts`). Each guess costs ~250ms on modern hardware. |
| **Online brute force / credential stuffing** | Not directly mitigated. App is responsible. Hook: `callbacks.onFailedLogin` fires on every failure so apps can rate-limit by IP+email. |
| **Timing-based username enumeration via login** | bcryptjs runtime dominates — login response time is constant regardless of whether the email exists. |
| **Plain-text passwords in logs** | Never logged. `Zod` validation strips passwords from error messages. Bcrypt hashing happens before any error surface. |

### Token attacks

| Threat | Mitigation |
|---|---|
| **Token leak in DB dump** | All tokens (email-verify, password-reset, refresh, magic-link, recovery codes) stored as SHA-256 hashes (`packages/core/src/utils/token.ts:hashToken`). Raw value never persists. |
| **Token replay (single-use enforcement)** | Reset / verify / magic-link / recovery-code tokens are deleted from the DB before the success response. A second request returns `INVALID_TOKEN` (`features/passwordReset.ts`, `features/magicLink.ts`, `features/twoFactor.ts`). |
| **Refresh token theft** | Rotation: every successful `/refresh` deletes the old token row and issues a new one. Stolen refresh tokens become useless on the next legitimate refresh. `auth.revokeAll(userId)` is the global kill switch. |
| **Timing-based token guessing** | All token comparisons use `crypto.timingSafeEqual` via `safeCompareTokens` (CSRF) or SHA-256 + DB index lookup (everything else). |
| **Short-token brute force** | Opaque tokens are 32 random bytes / 256 bits of entropy (`generateOpaqueToken`). Infeasible to brute force. |

### JWT attacks

| Threat | Mitigation |
|---|---|
| **`alg: none` / algorithm confusion** | `verifyJwt` (`packages/core/src/utils/token.ts:95`) hardcodes `algorithms: ['HS256']` in the verify call. Even if an attacker sends a token with `alg: none`, verify rejects it. |
| **JWT expiry bypass** | `jsonwebtoken` library enforces `exp` claim. Tokens are minted with `expiresIn: '7d'` default (recommend `'15m'` paired with refresh tokens). |
| **Algorithm downgrade via JWS-to-JWE confusion** | We only sign with HS256; no JWE in the library. There's no key resolution that an attacker could redirect. |
| **2FA challenge token reused as session token (or vice versa)** | Challenge tokens carry `scope: '2fa-pending'` (`utils/token.ts:signTwoFactorChallenge`). `verifyTwoFactorChallenge` rejects tokens with any other scope. Session JWT verification rejects challenge-scoped tokens implicitly because no AuthCore code reads `scope` on session JWTs. |
| **Compromised AUTH_SECRET** | All JWTs are minted with one secret. Rotation invalidates every live session — by design. There's no key-id rotation built in; the assumption is that a `session.secret` rotation is paired with a session purge. |

### OAuth attacks

| Threat | Mitigation |
|---|---|
| **State forgery / CSRF on callback** | State is an HMAC-SHA256-signed envelope (`packages/core/src/features/oauth.ts:signEnvelope`) carrying nonce, provider id, PKCE verifier, redirect URI, and issued-at timestamp. Verified with `timingSafeEqual`. Tampered state → 401 `INVALID_TOKEN`. |
| **State replay** | 10-minute TTL on the `issuedAt` claim. Beyond the window → 401. |
| **Authorization code interception (mobile / public clients)** | PKCE (S256) is always sent — `code_challenge` on the authorize URL, `code_verifier` on the token exchange. Even providers without strict PKCE enforcement get the same level of protection. |
| **Account takeover via unverified email** | Auto-link policy refuses to link an OAuth account to an existing local user when the provider reports `email_verified: false`. Throws `EMAIL_NOT_VERIFIED_BY_PROVIDER` (409). Blocks the "attacker registers unverified Gmail with victim's address, then signs in via Google" attack. |
| **Apple client-secret JWT compromise** | Client secret is a per-request JWT signed with the `.p8` private key, valid for 10 minutes. If a generated JWT leaks, blast radius is one exchange. Long-term compromise requires the `.p8` file itself. |

### CSRF (cookie mode)

| Threat | Mitigation |
|---|---|
| **Cross-site state-changing requests** | Synchronizer-token pattern, opt-in via `session.csrf: true`. Non-httpOnly `${cookieName}_csrf` cookie + `X-CSRF-Token` header. `safeCompareTokens` for verification. Off by default for backward compatibility, but recommended in cookie mode. |
| **CSRF cookie reset bypass** | First request (before cookie exists) is exempt — necessary because the user needs to log in to GET the cookie. This is the standard synchronizer-token design. State-changing requests with no CSRF cookie at all are accepted; state-changing requests with a CSRF cookie but wrong header are rejected. |
| **SameSite-only bypass** | Cookies are `SameSite=Lax`. Modern browsers block cross-site POST navigations. CSRF guard is defense-in-depth above SameSite. |

### Magic-link attacks

| Threat | Mitigation |
|---|---|
| **Email account takeover → magic-link account takeover** | This is by design — magic-link trusts the email channel. If a user's email is compromised, their AuthCore account is compromised. Not a library-level mitigation. The user must protect their email account. |
| **Token replay** | Single-use: token row deleted before the consume response. Second click returns 400 `INVALID_TOKEN`. |
| **Brute-force consume** | Tokens are 256-bit opaque values, 15-minute TTL. Brute force is infeasible. |
| **Enumeration via send** | `POST /magic-link` always returns 200 regardless of whether the email exists. Auto-create creates a row anyway (with sentinel password hash), so even response timing doesn't leak existence. |

### 2FA attacks

| Threat | Mitigation |
|---|---|
| **TOTP brute force** | 6-digit code = 1,000,000 possibilities. App is responsible for rate-limiting `verifyTwoFactor` (hook: `onFailedLogin` analog — TODO: dedicated callback). Without rate limiting an attacker can guess in ~10 minutes worst-case. |
| **TOTP replay** | RFC 6238 design: codes are time-bound to a 30s step ±1. Replaying within ~90s window works (this is acceptable — same as every other TOTP implementation). Apps that need replay protection must track used codes themselves. |
| **TOTP secret compromise via DB dump** | Plaintext at rest — see [Known tradeoffs](#known-tradeoffs). |
| **Recovery code brute force** | Codes are `xxxx-xxxx-xxxx` from 31-character alphabet, ~63 bits of entropy. Infeasible to brute force. SHA-256 hashed at rest. Single-use. |
| **Recovery code cross-user use** | `useRecoveryCode` verifies the token's `userId` matches the challenge JWT's `sub` (`features/twoFactor.ts`). Stolen recovery code can't authenticate as a different user. |
| **2FA bypass via session-token reuse as challenge** | Scope check on the challenge JWT — see JWT attacks above. |
| **2FA bypass via disable without re-auth** | `auth.disableTwoFactor` requires the user's current password. A stolen session cookie can't silently turn 2FA off. |
| **Phishing of TOTP codes** | Not mitigated. Same limitation as every TOTP implementation. WebAuthn / passkeys would mitigate this — not yet shipped. |

### Email and identity

| Threat | Mitigation |
|---|---|
| **Email enumeration via `/forgot-password`** | Always returns 200, regardless of whether the email exists. Email-send errors are caught and swallowed. |
| **Email enumeration via `/register`** | Returns 409 on duplicate email. This is a deliberate UX choice — the alternative (200 with "check your email") confuses users who genuinely forgot they have an account. Apps that prefer enumeration-safe signup can catch the 409 client-side and show a generic message. |
| **Secret leak in email body (CVE-class)** | Reset / verify / invite / magic-link URLs are built from `baseUrl + paths.*` supplied by the framework adapter. `auth.forgotPassword` throws `MISSING_URL` (500) if a direct caller forgets to supply one. Was the cause of CVE-2026-AUTHCORE-001 in 0.5.0–0.8.x; fixed in 0.9.0. **Apps that ran 0.5–0.8 with passwordReset enabled must rotate AUTH_SECRET.** |
| **Email verification bypass via cross-link** | Verify-email tokens are not magic-link tokens — they have `type: 'EMAIL_VERIFICATION'` and `findToken` filters by type. A token of one type cannot be redeemed as another. |
| **Invitation as account takeover** | Invitations create the user; `acceptInvitation` sets the password. The invite link is the only way to claim that account. Treated as a 48-hour single-use token. |

## Out of scope

AuthCore does NOT defend against, and the host app is responsible for:

1. **DoS and rate limiting.** Wire your own via `callbacks.onFailedLogin`. The Anthropic recommendation: rate-limit at the load balancer or in middleware before requests reach AuthCore.
2. **Account lockout after N failed attempts.** Same as above.
3. **Impossible-travel detection.** Check IP / geolocation in `callbacks.onSignIn`.
4. **Device fingerprinting / session anomaly detection.**
5. **IP allowlists / blocklists.**
6. **Network-level attacks (MITM, DNS hijack, BGP).** Use TLS. The cookies default to `Secure` in production.
7. **Compromised user device (malware, browser extensions, infostealers).** Nothing in the library can defend against an attacker who fully controls the user's browser session.
8. **Compromised hosting / runtime.** If the attacker has code execution on your server, `AUTH_SECRET` is in `process.env` and they can do anything. Use secrets managers + ephemeral compute where this matters.
9. **Database-at-rest encryption.** Use the disk-level or column-level features of your DB (Postgres TDE, AWS RDS encryption, etc.).
10. **SAML / SCIM / SSO provisioning.** Out of scope for AuthCore. Build on top of OAuth or wait for a community plugin.
11. **Compliance certifications (SOC 2, PCI, HIPAA, etc.).** AuthCore is a library, not a service — certifications attach to deployments, not code.
12. **WebAuthn / passkeys.** Roadmap item, not yet shipped.
13. **SMS-based 2FA.** Intentionally NOT shipped. SMS 2FA is known weak (SIM swap, SS7) and the industry has moved away from it.
14. **Audit logging.** Use the lifecycle callbacks (`onSignIn`, `onSignOut`, `onFailedLogin`, `onTokenRefresh`, `onPasswordReset`) to feed your own audit pipeline.

## Cryptographic primitives

Inventory for compliance reviews and security auditors.

| Use | Primitive | Parameters | Source |
|---|---|---|---|
| Password hashing | bcryptjs | ≥12 rounds (silently clamped) | `bcryptjs` npm package, `packages/core/src/utils/password.ts` |
| Opaque token generation | `crypto.randomBytes` | 32 bytes / 256 bits | Node.js stdlib, `packages/core/src/utils/token.ts:generateOpaqueToken` |
| Token hash for storage | SHA-256 | hex digest, 64 chars | Node.js stdlib, `packages/core/src/utils/token.ts:hashToken` |
| Token equality compare | `crypto.timingSafeEqual` | constant-time | Node.js stdlib, `packages/core/src/utils/token.ts:safeCompareTokens` |
| Session JWT | HS256 | secret from `session.secret`, default 7d TTL | `jsonwebtoken` npm package, `packages/core/src/utils/token.ts:signJwt` |
| 2FA challenge JWT | HS256 | scope=`2fa-pending`, default 5min TTL | `packages/core/src/utils/token.ts:signTwoFactorChallenge` |
| OAuth state envelope | HMAC-SHA256 | signed with `session.secret`, 10min TTL | `packages/core/src/features/oauth.ts:signEnvelope` |
| OAuth PKCE challenge | SHA-256 | S256 method (RFC 7636) | `packages/core/src/utils/token.ts:pkceChallenge` |
| Apple client secret JWT | ES256 | signed with developer's .p8 key, default 10min TTL | `packages/core/src/oauth/apple.ts:generateAppleClientSecret` |
| TOTP code | HOTP/HMAC-SHA1 (RFC 6238) | 30s period, 6 digits, ±1 step drift | `packages/core/src/utils/totp.ts` |
| TOTP secret | `crypto.randomBytes` | 20 bytes / 160 bits, base32 encoded | `packages/core/src/utils/totp.ts:generateTotpSecret` |
| Recovery code | `crypto.randomBytes` (per char) | 31-char alphabet, 12 chars + 2 dashes, ~63 bits | `packages/core/src/utils/totp.ts:generateRecoveryCodes` |
| CSRF synchronizer token | `crypto.randomBytes` | 32 bytes / 256 bits, hex | `packages/core/src/utils/token.ts:generateCsrfToken` |

**SHA-1 in TOTP** is RFC-mandated and what every authenticator app expects. The HMAC construction makes this safe even with SHA-1's collision weakness — preimage resistance is what matters here, and SHA-1's preimage resistance is unbroken.

## Known tradeoffs

Decisions that are debatable. Calling them out so reviewers don't waste time re-litigating in private.

### TOTP secret stored plaintext

The user's TOTP secret is stored unencrypted in `users.two_factor_secret`. Column-level encryption was considered and rejected because:

1. Decryption key has to live somewhere your server can read at request time, so it'd be at the same trust level as `session.secret`. Compromise of one means compromise of the other.
2. Password hashes are bcrypt-hashed precisely because they're high-value and can be brute-forced offline. TOTP secrets aren't brute-forceable offline in a meaningful sense — they're 160-bit secrets used only to generate codes.
3. The threat (DB compromise) is better handled at the DB layer (encrypted volumes, encrypted backups) than the application layer.

If your threat model demands it, encrypt the column with your KMS via Drizzle's `customType` and a getter/setter. The adapter contract doesn't constrain how `twoFactorSecret` is stored.

### Magic-link auto-creates users

`POST /magic-link` for an unknown email creates a new user (with `emailVerified: true`, since the email was just confirmed by the link's arrival). This means:

- Anyone with an email account can create AuthCore accounts on your service.
- This is the same property as `POST /register` — both flows let arbitrary emails become users.
- Apps that need invite-only access should disable `magicLink` in `features` and gate `/register` themselves (or use `authcore.invite` exclusively).

### OAuth-only users can't login with password

If a user signs up via OAuth, their `passwordHash` is set to a sentinel (`!OAUTH_NO_PASSWORD`) that can never match a real password. They can claim a password via the standard forgot-password flow — `resetPassword` doesn't care what the prior hash was. This is documented behavior, not a bug.

### Login email enumeration via 409 on register

Discussed in the threats table. Tradeoff between UX (clear error: "you already have an account") and enumeration safety. We chose UX. Apps that prefer enumeration safety can swallow the 409 client-side.

### `session.secret` rotation has no key-id

JWTs aren't tagged with a key ID. Rotating `AUTH_SECRET` invalidates every live session, which is by design — recoverable from compromise, but disruptive. If you need overlapping-key rotation (sign with new, verify either), add a thin wrapper around `verifyToken` that tries both secrets.

## Verification recipes

For a security reviewer reproducing the claims above:

```bash
# Inspect every token-comparison call site
grep -rn "timingSafeEqual\|safeCompareTokens" packages/

# Inspect every place a token is created / stored
grep -rn "hashToken\|generateOpaqueToken" packages/

# Verify HS256-only on JWT verification
grep -rn "algorithms:" packages/core/src/utils/token.ts

# Verify forgot-password / reset / verify / magic-link all delete-before-return
grep -B2 -A5 "deleteToken" packages/core/src/features/

# Run the integration suite against a real Postgres
docker compose up -d
pnpm --filter @authcore/prisma-adapter db:push
pnpm -w run test
```

## Reporting issues

If you find anything that contradicts this document — a missing mitigation, an incorrect claim, an unstated assumption — please report it. See [`SECURITY.md`](https://github.com/david-ouatedem/auth-core/blob/main/SECURITY.md) for the disclosure process.

We treat this document as code: a security regression IS a discrepancy with what's written here.
