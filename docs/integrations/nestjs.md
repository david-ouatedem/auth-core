# NestJS

`@authcore/nestjs` is a dynamic NestJS module that registers all auth routes and exposes guards and decorators for protecting your controllers.

## Installation

```bash
npm install @authcore/nestjs @authcore/prisma-adapter
```

Peer dependencies (already present in any NestJS project):

- `@nestjs/common` ^10 or ^11
- `@nestjs/core` ^10 or ^11
- `reflect-metadata` ^0.1.13 or ^0.2.0

## Module Setup

Import `AuthModule` in your root `AppModule`:

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

## Protecting Routes

Use `AuthGuard` on any controller or route handler. The authenticated user is injected with `@CurrentUser()`:

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

## Role-Based Access Control

Pair `RolesGuard` with the `@Roles()` decorator. Always apply `AuthGuard` first so `request.user` is populated:

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

Enable RBAC in `AuthModule.register()`:

```ts
AuthModule.register({
  db: prismaAdapter(prisma),
  session: { strategy: 'jwt', secret: process.env.AUTH_SECRET! },
  rbac: { defaultRole: 'user' },
})
```

## Optional Authentication

Use `AuthOptionalGuard` on routes that work for both authenticated and anonymous users:

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

## With Email Features & Invitations

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
  baseUrl: 'https://yourdomain.com',
})
```

## API Reference

### `AuthModule.register(options)`

All options from [`@authcore/core` configuration](/configuration) are accepted, plus:

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `baseUrl` | `string` | `''` | Base URL used to build links in auth emails |

### Guards

| Guard | Description |
|-------|-------------|
| `AuthGuard` | Requires a valid JWT. Attaches the user to `request.user`. Returns 403 if unauthenticated. |
| `AuthOptionalGuard` | Attaches `request.user` if a valid token is present. Never rejects the request. |
| `RolesGuard` | Checks `request.user.role` against `@Roles()`. Returns 403 if the role is not allowed. Must be used after `AuthGuard`. |

### Decorators

| Decorator | Description |
|-----------|-------------|
| `@CurrentUser()` | Parameter decorator — extracts the authenticated user from the request |
| `@Roles('admin', 'editor')` | Sets the required roles for a route or controller |
| `@Public()` | Marks a route as public, bypassing `AuthGuard` |

### Routes

All routes are mounted under `/auth` by default:

| Method | Route | Body | Description |
|--------|-------|------|-------------|
| POST | `/auth/register` | `{ email, password }` | Register a new user |
| POST | `/auth/login` | `{ email, password }` | Log in, returns JWT |
| POST | `/auth/logout` | — | Invalidate the session |
| GET | `/auth/me` | — | Return the current user |
| POST | `/auth/verify-email` | `{ token }` | Verify email address |
| POST | `/auth/forgot-password` | `{ email }` | Send password reset email (always 200) |
| POST | `/auth/reset-password` | `{ token, password }` | Reset password |
| POST | `/auth/invite` | `{ email, role? }` | Send an invitation |
| POST | `/auth/accept-invitation` | `{ token, password }` | Accept an invitation and set a password |
