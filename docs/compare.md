---
description: "How AuthCore compares to Better Auth, Auth.js, Passport and hosted auth (Clerk, Auth0). When to choose it and when not to."
---

# AuthCore vs. other auth options

Short version: AuthCore is a **self-hosted, security-first, batteries-included** auth library with **one core and adapters** for Express, Fastify, NestJS and Next.js. If that is what you need, it saves you weeks. If it is not, the alternatives below may fit better. This page tries to be fair; check each project's current docs before deciding.

## At a glance

| | AuthCore | Better Auth | Auth.js (NextAuth) | Passport | Clerk / Auth0 |
|---|---|---|---|---|---|
| Hosting | Your server + your DB | Your server + your DB | Your server | Your server | Vendor-hosted |
| Scope | Full auth lifecycle | Full auth lifecycle + plugins | Sessions + OAuth focus | Strategies only | Full, plus UI and user management |
| You write register/login/reset routes | No (mounted for you) | No | Partly (credentials flow is minimal) | Yes | No |
| Frameworks | Express, Fastify, NestJS, Next.js (+ React SDK) | Many | Next.js first, others experimental | Express-style | SDKs for many |
| Published threat model | Yes: [Threat Model](/security/threat-model) | Check their docs | Check their docs | N/A | Vendor security pages |
| Pricing | Free, open source (MIT) | Free, open source | Free, open source | Free, open source | Free tier, then per-user |

## What AuthCore includes out of the box

Registration and login, JWT sessions with **rotating refresh tokens**, email verification, password reset, invitations with roles, magic-link login, OAuth (Google, GitHub, Microsoft, Discord, Apple), TOTP two-factor with recovery codes, RBAC, and opt-in CSRF protection in cookie mode.

## Security defaults you do not have to think about

- bcrypt with at least 12 rounds (clamped from below), passwords never stored or logged in plain text
- Tokens are 32 random bytes, SHA-256 hashed before storage, raw value shown once, compared with `crypto.timingSafeEqual`
- Forgot-password always returns 200 (no email enumeration)
- Reset/verify/invite URLs built from `baseUrl + paths.*`; the signing secret never appears in a URL or email
- Every input validated with Zod
- JWT is HS256 only (no algorithm confusion)

Details and the things AuthCore does **not** defend against are in the [Threat Model](/security/threat-model).

## Choose AuthCore when

- You want to own your user table and run auth in your own infrastructure
- You use Express, Fastify, NestJS or Next.js and want the same behavior in each
- You want secure defaults and a written security spec instead of assembling pieces yourself
- You want refresh-token rotation, 2FA and email flows without building them

## Choose something else when

- **You want a hosted dashboard, prebuilt UI and user management** with no auth code to own: use Clerk, Auth0 or a similar service.
- **You need a plugin ecosystem or features AuthCore does not have** (for example organizations/multi-tenancy or passkeys), and another library already ships them: check Better Auth.
- **You only need OAuth sign-in in a Next.js app** and nothing else: Auth.js may be enough.
- **You need an unusual protocol or strategy** (SAML, LDAP): Passport has a large strategy catalog.

## Migrating

AuthCore keeps its data model small (`User`, `Token`, optional `OAuthAccount`), so importing users from another system is mostly mapping `email`, `passwordHash` (bcrypt hashes are compatible) and `role`. See the [Getting Started](/getting-started) and [Adapters](/adapters/prisma) pages.
