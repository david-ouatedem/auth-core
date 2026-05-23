# Security Policy

## Supported Versions

| Version    | Supported |
|------------|-----------|
| 0.10.x     | Yes — current  |
| 0.9.x      | Critical fixes only |
| 0.7.x–0.8.x| Not supported — upgrade to 0.9+ |
| 0.5.x–0.6.x| **Not supported. Upgrade required.** Affected by the `forgotPassword` secret leak — see *Known Past Issues* below. |
| < 0.5      | No        |

## Recommended Defaults

For production deployments on 0.10+:

1. **Enable refresh tokens.** Set a short `session.expiresIn` (e.g. `'15m'`) and a longer `session.refreshExpiresIn` (default `'30d'`). The client SDK rotates the refresh token on every `POST /refresh`. A leaked JWT is good for at most 15 minutes; a leaked refresh token can be revoked via `auth.revoke()` or `auth.revokeAll(userId)`.
2. **Enable CSRF in cookie mode.** Set `session.csrf: true`. The framework adapter sets the `${cookieName}_csrf` cookie automatically; `@authcore/core-web` and `@authcore/react` add the `X-CSRF-Token` header on POST/PUT/PATCH/DELETE without code changes.
3. **Rotate `AUTH_SECRET` on a schedule** (every 6–12 months minimum). Combined with refresh-token revocation, this gives you a clean "rotate everything" path.
4. **Wire `callbacks.onFailedLogin`** to a rate limiter (express-rate-limit, fastify-rate-limit) and/or audit log. AuthCore doesn't ship rate limiting; it gives you the hook.
5. **Customize email templates** to remove any "from AuthCore" defaults and brand them to your product. See `docs/security/email-templates.md`.

## Known Past Issues

- **`AUTH_SECRET` leak in password reset emails (fixed in 0.9.0).** Releases 0.5.0 through 0.8.x that enabled the `passwordReset` feature embedded the JWT signing secret in the outbound reset-email URL. Email providers, inbox archives, and SIEM logs of affected deployments may have captured the secret. If you ran any affected version with `passwordReset` enabled:
  1. **Rotate `AUTH_SECRET` immediately.** Any JWT minted with the old secret should be considered compromised.
  2. Force-logout existing sessions by deploying with the new secret (JWTs signed with the old secret will be rejected).
  3. Audit mail-provider logs for the leaked secret value and request log purges where possible.

## Reporting a Vulnerability

**Please do not open a public GitHub issue for security vulnerabilities.**

If you discover a security issue, email **davdev1400@gmail.com** with:

1. A description of the vulnerability
2. Steps to reproduce
3. The potential impact
4. Any suggested fixes (optional)

You should receive an acknowledgment within 48 hours. We will work with you to understand the issue and coordinate a fix before any public disclosure.

## Security Design Principles

AuthCore follows these security practices:

- **Password hashing**: bcrypt with 12+ rounds
- **Token storage**: tokens are SHA-256 hashed before database storage; raw tokens are returned to the user only once
- **Token comparison**: always uses `crypto.timingSafeEqual` to prevent timing attacks
- **Email enumeration prevention**: forgot-password always returns 200 regardless of whether the email exists
- **Input validation**: all inputs validated with Zod before any processing
- **Token expiry**: password reset tokens expire in 1 hour, email verification in 24 hours, invitation tokens in 48 hours

## Responsible Disclosure

We ask that you:

- Give us reasonable time to fix the issue before public disclosure
- Do not exploit the vulnerability beyond what is necessary to demonstrate it
- Do not access or modify other users' data

We will credit you in the release notes (unless you prefer to remain anonymous).
