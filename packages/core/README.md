# @authcore/core

> Framework-agnostic authentication engine — types, validation, password hashing, JWT, and adapter interfaces.

This is the core package that powers all AuthCore framework adapters. You typically won't use it directly — instead, use [`@authcore/express`](https://www.npmjs.com/package/@authcore/express) or [`@authcore/fastify`](https://www.npmjs.com/package/@authcore/fastify).

## Install

```bash
npm install @authcore/core
```

## What's Inside

### `createAuth(config)`

The main factory that creates an auth instance with `register`, `login`, `verifyToken`, `verifyEmail`, `forgotPassword`, and `resetPassword` methods.

```ts
import { createAuth } from '@authcore/core'

const auth = createAuth({
  db: myDatabaseAdapter,
  session: { strategy: 'jwt', secret: 'your-secret', expiresIn: '7d' },
  email: { provider: myEmailAdapter, from: 'auth@example.com' },
  features: ['emailVerification', 'passwordReset'],
  password: { minLength: 8 },
  callbacks: {
    onSignUp: (user) => { /* ... */ },
    onSignIn: (user) => { /* ... */ },
  },
})

const { user, token } = await auth.register({ email: 'user@example.com', password: 'securepass' })
const { user, token } = await auth.login({ email: 'user@example.com', password: 'securepass' })
const publicUser = await auth.verifyToken(token)
```

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
} from '@authcore/core'
```

## License

[MIT](https://github.com/david-ouatedem/auth-core/blob/main/LICENSE)
