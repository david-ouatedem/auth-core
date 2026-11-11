---
name: authcore
description: Add or modify authentication with AuthCore (@authcore/*) in a Node.js project: Express, Fastify, NestJS or Next.js backends, Prisma or Drizzle storage, email verification, password reset, refresh tokens, OAuth, 2FA, RBAC. Use when the user asks to add login/registration/auth, or edits code that imports @authcore packages.
---

# AuthCore

AuthCore is a self-hosted auth library. Your job is to wire it up, not to write auth logic.

## Workflow

1. Detect the framework (`express`, `fastify`, `@nestjs/core`, `next`) and ORM (`@prisma/client`, `drizzle-orm`) from `package.json`.
2. Install the matching packages: `@authcore/<framework>` (Next.js also needs `@authcore/core`), `@authcore/prisma-adapter` or `@authcore/drizzle-adapter`, plus `@authcore/resend-adapter` or `@authcore/nodemailer-adapter` if email features are needed.
3. If installed, read `node_modules/@authcore/<framework>/AGENTS.md` for the canonical snippet and guardrails. Otherwise read https://david-ouatedem.github.io/auth-core/llms.txt.
4. Add the database tables (Prisma schema from the docs, or re-export `users`, `tokens`, `oauthAccounts` from `@authcore/drizzle-adapter/pg|sqlite`) and run the migration.
5. Create one `createAuth({ db, session: { strategy: 'jwt', secret: process.env.AUTH_SECRET! }, ... })` instance and mount the router/plugin/module/handler.
6. Protect routes with the adapter's middleware/guard; use `requireRole` / `@Roles` for RBAC.
7. Add `AUTH_SECRET` (`openssl rand -hex 32`) to `.env` and `.env.example`; never commit it.
8. Run the project's tests/typecheck and try register + login with curl.

## Guardrails

- Do not write your own login/register/reset routes, password hashing, or JWT code.
- Never hardcode, log or embed `AUTH_SECRET` in URLs or emails.
- Email-based features (`emailVerification`, `passwordReset`, `invitation`, `magicLink`) need an `email` provider and `from` address.
- Direct `@authcore/core` callers must pass `resetUrl` / `inviteUrl` / `magicLinkUrl`.
- Keep one cookie name (`session.cookieName`) across routes and middleware; enable `session.csrf` for cookie mode if state-changing requests come from browsers.
- Client-side role checks are UI-only; enforce on the server.
- When unsure about an option, read the docs instead of guessing.
