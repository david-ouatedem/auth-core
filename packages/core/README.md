# @authcore/core

> Self-hosted, security-first authentication engine for Node.js: register/login, JWT with rotating refresh tokens, email verification, password reset, invitations, magic links, OAuth and TOTP 2FA.

[![npm](https://img.shields.io/npm/v/@authcore/core)](https://www.npmjs.com/package/@authcore/core)
[![npm downloads](https://img.shields.io/npm/dw/@authcore/core)](https://www.npmjs.com/package/@authcore/core)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://github.com/david-ouatedem/auth-core/blob/main/LICENSE)

**[Docs](https://david-ouatedem.github.io/auth-core/)** · **[Threat model](https://david-ouatedem.github.io/auth-core/security/threat-model)** · **[Compare](https://david-ouatedem.github.io/auth-core/compare)** · **[GitHub](https://github.com/david-ouatedem/auth-core)**

This is the framework-agnostic engine behind every AuthCore adapter. Pick the entry point that fits your stack:

| You use | Install |
|---------|---------|
| Express | `npm i @authcore/express @authcore/prisma-adapter` |
| Fastify | `npm i @authcore/fastify @fastify/cookie @authcore/prisma-adapter` |
| NestJS | `npm i @authcore/nestjs @authcore/prisma-adapter` |
| Next.js (App Router) | `npm i @authcore/nextjs @authcore/core @authcore/prisma-adapter` |
| Anything else / scripts | `npm i @authcore/core @authcore/prisma-adapter` (this package) |

Or scaffold a working app: `npx create-authcore-app`.

Use `@authcore/core` directly when you have no adapter for your framework, are writing tests, or want to build custom routes. Everything the adapters do is a thin wrapper over `createAuth` below.

**Using an AI coding assistant?** Read [`AGENTS.md`](./AGENTS.md) (shipped in this package) or point it at [`llms.txt`](https://david-ouatedem.github.io/auth-core/llms.txt).

## Install

```bash
npm install @authcore/core
```

## What's Inside

### `createAuth(config)`

The main factory that creates an auth instance with `register`, `login`, `verifyToken`, `verifyEmail`, `forgotPassword`, `resetPassword`, `invite`, `acceptInvitation`, `refresh`, `revoke`, and `revokeAll` methods.

```ts
import { createAuth } from '@authcore/core'

const auth = createAuth({
  db: myDatabaseAdapter,
  session: {
    strategy: 'jwt',
    secret: 'your-secret',
    expiresIn: '7d',
    cookieName: 'my_token',     // optional; default 'authcore_token'
  },
  email: { provider: myEmailAdapter, from: 'auth@example.com' },
  features: ['emailVerification', 'passwordReset', 'invitation'],
  password: { minLength: 8 },
  rbac: { defaultRole: 'user' },
  callbacks: {
    onSignUp: (user) => { /* ... */ },
    onSignIn: (user) => { /* ... */ },
  },
})

const { user, token } = await auth.register({ email: 'user@example.com', password: 'securepass' })
const { user, token } = await auth.login({ email: 'user@example.com', password: 'securepass' })
const publicUser = await auth.verifyToken(token)

// Direct-core callers MUST pass a resetUrl. Framework adapters do this for you.
await auth.forgotPassword(
  { email: 'user@example.com' },
  { resetUrl: 'https://app.example.com/reset-password' },
)

// The resolved config is exposed so framework adapters can read session.cookieName, etc.
console.log(auth.config.session.cookieName)
```

> **Breaking change in 0.9 (direct-core callers only):** `auth.forgotPassword(input)` is now `auth.forgotPassword(input, { resetUrl })`. The framework adapters (`@authcore/express`, `@authcore/fastify`, `@authcore/nestjs`) build the URL automatically from `baseUrl + paths.resetPassword`, so apps using those packages are unaffected. Direct-core callers must add the second argument or `forgotPassword` throws `AuthError('resetUrl is required', 'MISSING_URL', 500)`. This is a deliberate loud failure that replaces the pre-0.9 silent leak of `session.secret` into reset-email URLs.

### Adapter Interfaces

Implement these to add support for any database or email provider:

```ts
import type { DatabaseAdapter, EmailAdapter } from '@authcore/core'
```

**DatabaseAdapter:**

```ts
interface DatabaseAdapter {
  findUserByEmail(email: string): Promise<User | null>
  findUserById(id: string): Promise<User | null>
  createUser(data: CreateUserInput): Promise<User>
  updateUser(id: string, data: Partial<User>): Promise<User>
  createToken(data: CreateTokenInput): Promise<Token>
  findToken(rawToken: string, type: TokenType): Promise<Token | null>
  deleteToken(id: string): Promise<void>
  deleteExpiredTokens(): Promise<void>
}
```

**EmailAdapter:**

```ts
interface EmailAdapter {
  send(options: { from: string; to: string; subject: string; html: string; text: string }): Promise<void>
}
```

### Types

```ts
import type {
  User,
  PublicUser,
  Token,
  TokenType,
  AuthCoreConfig,
  AuthCore,
  DatabaseAdapter,
  EmailAdapter,
  AuthError,
} from '@authcore/core'
```

### Utilities

```ts
import {
  hashPassword,
  verifyPassword,
  generateOpaqueToken,
  hashToken,
  safeCompareTokens,
  signJwt,
  verifyJwt,
} from '@authcore/core'
```

### Validation Schemas (Zod)

```ts
import {
  registerSchema,
  loginSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
  verifyEmailSchema,
  inviteSchema,
  acceptInvitationSchema,
} from '@authcore/core'
```

### RBAC

Users have a `role` field (string). The default role for new registrations is `'user'`, configurable via `rbac.defaultRole`. The role is included in the JWT payload, so role checks don't need extra database lookups.

### Invitation

Enable the `'invitation'` feature to let authenticated users invite new users by email. The invited user receives a link to set their password and activate their account. Invitation tokens expire in 48 hours.

## License

[MIT](https://github.com/david-ouatedem/auth-core/blob/main/LICENSE)
