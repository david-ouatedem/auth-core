# @authcore/types

> Shared TypeScript type definitions for the AuthCore ecosystem.

## Install

```bash
npm install @authcore/types
```

## Why this package?

Frontend packages like `@authcore/react` and `@authcore/core-web` only need type definitions (e.g. `PublicUser`), not the full server-side `@authcore/core` which bundles `bcryptjs`, `jsonwebtoken`, and `zod`. This package provides those types without any runtime dependencies.

## Exported Types

### Core types

- `User` -- full user record (includes `passwordHash`, server-side only)
- `PublicUser` -- safe user shape returned to clients (no `passwordHash`)
- `Token` -- token record stored in the database
- `TokenType` -- `'EMAIL_VERIFICATION' | 'PASSWORD_RESET' | 'SESSION' | 'INVITATION'`

### Input types

- `CreateUserInput` -- shape for creating a new user
- `CreateTokenInput` -- shape for creating a new token

### Adapter interfaces

- `DatabaseAdapter` -- contract for database implementations (Prisma, Drizzle, etc.)
- `EmailAdapter` -- contract for email providers (Resend, Nodemailer, etc.)

### Configuration types

- `AuthCoreConfig` -- top-level configuration object
- `SessionConfig` -- JWT session settings (`strategy`, `secret`, `expiresIn`, `cookieName`)
- `EmailConfig` -- email provider settings
- `AuthCallbacks` -- optional lifecycle callbacks (`onSignUp`, `onSignIn`, etc.)

`SessionConfig.cookieName` (added in 0.9) is the single source of truth for the auth cookie name across all framework adapters. Defaults to `'authcore_token'`.

## Usage

```ts
import type { PublicUser, DatabaseAdapter, AuthCoreConfig } from '@authcore/types'
```

All types are also re-exported from `@authcore/core` for convenience.

## License

[MIT](https://github.com/david-ouatedem/auth-core/blob/main/LICENSE)
