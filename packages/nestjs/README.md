# @authcore/nestjs

> NestJS adapter for AuthCore. Dynamic module, guards, and decorators.

## Install

```bash
# Core packages
npm install @authcore/nestjs @authcore/prisma-adapter

# Prisma client (required)
npm install @prisma/client

# Prisma CLI (required for migrations/codegen — dev dependency)
npm install --save-dev prisma

# Prisma 6 only: driver adapter for your database (PostgreSQL example)
npm install @prisma/adapter-pg pg
npm install --save-dev @types/pg
```

> If you are on Prisma 5 you do not need `@prisma/adapter-pg`. See the
> [`@authcore/prisma-adapter` README](https://www.npmjs.com/package/@authcore/prisma-adapter)
> for schema setup and Prisma version details.

Peer dependencies (already installed in any NestJS project):
- `@nestjs/common` (^10.0.0 or ^11.0.0)
- `@nestjs/core` (^10.0.0 or ^11.0.0)
- `reflect-metadata` (^0.1.13 or ^0.2.0)

## Usage

### Module Setup

```ts
// app.module.ts
import { Module } from '@nestjs/common'
import { AuthModule } from '@authcore/nestjs'
import { prismaAdapter } from '@authcore/prisma-adapter'
import { PrismaClient } from '@prisma/client'

// Prisma 5 (default prisma-client-js generator):
const prisma = new PrismaClient()

// Prisma 6 (new prisma-client generator — requires a driver adapter):
// import { PrismaPg } from '@prisma/adapter-pg'
// const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! })
// const prisma = new PrismaClient({ adapter })

@Module({
  imports: [
    AuthModule.register({
      db: prismaAdapter(prisma),
      session: { strategy: 'jwt', secret: process.env.AUTH_SECRET! },
    }),
  ],
})
export class AppModule {}
```

This registers all auth routes under `/auth` and makes guards available globally.

### Protecting Routes

```ts
import { Controller, Get, UseGuards } from '@nestjs/common'
import { AuthGuard, CurrentUser } from '@authcore/nestjs'
import type { PublicUser } from '@authcore/nestjs'

@Controller('dashboard')
@UseGuards(AuthGuard)
export class DashboardController {
  @Get()
  getDashboard(@CurrentUser() user: PublicUser) {
    return { user }
  }
}
```

### Role-Based Access Control

```ts
import { Controller, Get, UseGuards } from '@nestjs/common'
import { AuthGuard, RolesGuard, Roles, CurrentUser } from '@authcore/nestjs'
import type { PublicUser } from '@authcore/nestjs'

@Controller('admin')
@UseGuards(AuthGuard, RolesGuard)
@Roles('admin')
export class AdminController {
  @Get()
  getAdmin(@CurrentUser() user: PublicUser) {
    return { message: 'Admin area', user }
  }
}
```

### Optional Authentication

```ts
import { Controller, Get, UseGuards } from '@nestjs/common'
import { AuthOptionalGuard, CurrentUser } from '@authcore/nestjs'
import type { PublicUser } from '@authcore/nestjs'

@Controller('public')
export class PublicController {
  @Get()
  @UseGuards(AuthOptionalGuard)
  getPublic(@CurrentUser() user: PublicUser | undefined) {
    return { user: user ?? null }
  }
}
```

## API

### `AuthModule.register(options)`

Creates a global NestJS module with all auth routes and providers. See [`@authcore/core`](https://www.npmjs.com/package/@authcore/core) for the full config reference.

Additional options:

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `baseUrl` | `string` | `''` | Base URL for building email links |
| `useCookies` | `boolean` | `false` | Set/clear an httpOnly cookie on register/login/logout/accept-invitation instead of returning the token in the body |

Cookie name comes from `session.cookieName` (default `'authcore_token'`). See `@authcore/types` for the full `SessionConfig` shape.

### Guards

| Guard | Description |
|-------|-------------|
| `AuthGuard` | Requires a valid JWT. Attaches `request.user`. Throws `UnauthorizedException` (401) if no token is present or the token is invalid. |
| `AuthOptionalGuard` | Attaches `request.user` if token is valid. Never rejects. |
| `RolesGuard` | Checks `request.user.role` against `@Roles()`. Throws `ForbiddenException` (403) if not allowed. Use after `AuthGuard`. |

### Cookie Mode

```ts
// main.ts
import cookieParser from 'cookie-parser'
const app = await NestFactory.create(AppModule)
app.use(cookieParser())
```

```ts
// app.module.ts
AuthModule.register({
  db: prismaAdapter(prisma),
  session: {
    strategy: 'jwt',
    secret: process.env.AUTH_SECRET!,
    cookieName: 'my_token',
  },
  useCookies: true,
})
```

When `useCookies: true`:
- `POST /auth/register`, `POST /auth/login`, `POST /auth/accept-invitation` set the cookie and return `{ user }` (no token in body).
- `POST /auth/logout` clears the cookie.
- `AuthGuard` / `AuthOptionalGuard` fall back to reading the cookie if no `Authorization: Bearer ...` header is present.

Cookie mode requires `@nestjs/platform-express` (the default) and `cookie-parser` middleware in `main.ts`.

### Decorators

| Decorator | Description |
|-----------|-------------|
| `@CurrentUser()` | Parameter decorator that extracts the authenticated user |
| `@Roles('admin', 'editor')` | Sets allowed roles for a route or controller |
| `@Public()` | Marks a route as public (skips `AuthGuard`) |

### Routes

When mounted at `/auth` (default):

| Method | Route | Body | Response |
|--------|-------|------|----------|
| POST | `/auth/register` | `{ email, password }` | `{ user, token }` |
| POST | `/auth/login` | `{ email, password }` | `{ user, token }` |
| POST | `/auth/logout` | - | `{ message }` |
| GET | `/auth/me` | - | `user` |
| POST | `/auth/verify-email` | `{ token }` | `{ message }` |
| POST | `/auth/forgot-password` | `{ email }` | `{ message }` |
| POST | `/auth/reset-password` | `{ token, password }` | `{ message }` |
| POST | `/auth/invite` | `{ email, role? }` | `{ message }` |
| POST | `/auth/accept-invitation` | `{ token, password }` | `{ user, token }` |

## With Email Verification, Password Reset, and Invitation

```ts
import { resendAdapter } from '@authcore/resend-adapter'

AuthModule.register({
  db: prismaAdapter(prisma),
  session: { strategy: 'jwt', secret: process.env.AUTH_SECRET! },
  email: {
    provider: resendAdapter(process.env.RESEND_API_KEY!),
    from: 'auth@yourdomain.com',
  },
  features: ['emailVerification', 'passwordReset', 'invitation'],
  rbac: { defaultRole: 'user' },
})
```

## License

[MIT](https://github.com/david-ouatedem/auth-core/blob/main/LICENSE)
