# Configuration

The `AuthCoreConfig` object is the single configuration point for AuthCore.

```ts
interface AuthCoreConfig {
  db: DatabaseAdapter
  session: SessionConfig
  email?: EmailConfig
  features?: Array<'emailVerification' | 'passwordReset'>
  password?: { minLength?: number; saltRounds?: number }
  callbacks?: AuthCallbacks
}
```

## `db` (required)

A `DatabaseAdapter` implementation. See [Prisma Adapter](/adapters/prisma).

```ts
import { prismaAdapter } from '@authcore/prisma-adapter'

const config = {
  db: prismaAdapter(prisma),
  // ...
}
```

## `session` (required)

```ts
interface SessionConfig {
  strategy: 'jwt'
  secret: string       // minimum 32 characters
  expiresIn?: string   // default: '7d'
}
```

## `email` (optional)

Required if you enable `emailVerification` or `passwordReset` features.

```ts
interface EmailConfig {
  provider: EmailAdapter
  from: string  // e.g. 'noreply@myapp.com'
}
```

See [Resend](/adapters/resend) or [Nodemailer](/adapters/nodemailer) adapters.

## `features` (optional)

Enable built-in features. Each feature adds routes to the auth router.

```ts
const config = {
  features: ['emailVerification', 'passwordReset'],
  email: {
    provider: resendAdapter(process.env.RESEND_API_KEY!),
    from: 'noreply@myapp.com',
  },
  // ...
}
```

- `emailVerification` — sends a verification email on register, adds `/verify-email` route
- `passwordReset` — adds `/forgot-password` and `/reset-password` routes

## `password` (optional)

```ts
const config = {
  password: {
    minLength: 8,    // default: 8
    saltRounds: 12,  // default: 12
  },
  // ...
}
```

## `callbacks` (optional)

Lifecycle hooks called after auth events.

```ts
const config = {
  callbacks: {
    onSignUp: async (user) => { /* ... */ },
    onSignIn: async (user) => { /* ... */ },
    onSignOut: async (userId) => { /* ... */ },
    onPasswordReset: async (user) => { /* ... */ },
  },
  // ...
}
```

## Auth Routes

The following routes are registered by `auth.router()` (Express) or `auth.plugin()` (Fastify):

| Method | Path | Description |
|--------|------|-------------|
| POST | `/register` | Create a new user |
| POST | `/login` | Authenticate and get a token |
| POST | `/logout` | Clear session (cookie mode) |
| GET | `/me` | Get current user (protected) |
| POST | `/verify-email` | Verify email with token |
| POST | `/forgot-password` | Request password reset (always 200) |
| POST | `/reset-password` | Reset password with token |

All route paths are customizable via the `routes` option in the router/plugin config.
