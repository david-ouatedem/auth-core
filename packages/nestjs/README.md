# @authcore/nestjs

> NestJS adapter for AuthCore. Dynamic module, guards, and decorators.

## Install

```bash
npm install @authcore/nestjs @authcore/prisma-adapter
```

## Usage

### Module Setup

```ts
// app.module.ts
import { Module } from '@nestjs/common'
import { AuthModule } from '@authcore/nestjs'
import { prismaAdapter } from '@authcore/prisma-adapter'
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

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

### Guards

| Guard | Description |
|-------|-------------|
| `AuthGuard` | Requires a valid JWT. Attaches `request.user`. Returns 403 if unauthenticated. |
| `AuthOptionalGuard` | Attaches `request.user` if token is valid. Never rejects. |
| `RolesGuard` | Checks `request.user.role` against `@Roles()`. Returns 403 if not allowed. Use after `AuthGuard`. |

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
