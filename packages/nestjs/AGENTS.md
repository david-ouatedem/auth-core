# @authcore/nestjs: guidance for AI coding agents

## Install

```bash
npm install @authcore/nestjs @authcore/prisma-adapter @authcore/types
```

## Canonical usage

```ts
import { Module, Controller, Get, UseGuards } from '@nestjs/common'
import { AuthModule, AuthGuard, RolesGuard, Roles, CurrentUser } from '@authcore/nestjs'
import type { PublicUser } from '@authcore/nestjs'
import { PrismaClient } from '@prisma/client'
import { prismaAdapter } from '@authcore/prisma-adapter'
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

@Controller('admin')
@UseGuards(AuthGuard, RolesGuard)
@Roles('admin')
export class AdminController {
  @Get() get(@CurrentUser() user: PublicUser) { return { user } }
}
```

## Rules for AI coding agents

1. **Use the framework adapter, not `@authcore/core` directly**, unless there is no adapter for the framework. Adapters mount all routes and build reset/verify/invite URLs for you.
2. **Never hand-roll auth the library already provides**: no custom bcrypt/JWT code, no custom `/login` or `/register` routes, no custom reset-token logic. Mount the router/handler instead.
3. **`AUTH_SECRET` must come from the environment** (>= 32 random chars, e.g. `openssl rand -hex 32`). Never hardcode it, log it, or put it in a URL or email.
4. **Required DB tables**: use the shipped schema (Prisma schema in the docs, or `users`/`tokens`/`oauthAccounts` exports from `@authcore/drizzle-adapter/pg` or `/sqlite`). Do not invent your own columns for users/tokens.
5. **Email features need an email adapter**: `emailVerification`, `passwordReset`, `invitation`, `magicLink` all require `email: { provider, from }` (`@authcore/resend-adapter` or `@authcore/nodemailer-adapter`).
6. **Direct-core callers must pass URLs**: `auth.forgotPassword(input, { resetUrl })`, `auth.invite(input, { inviteUrl })`, `auth.sendMagicLink(input, { magicLinkUrl })`. A missing URL throws `MISSING_URL` on purpose.
7. **Cookie mode**: the cookie name is `session.cookieName` (default `authcore_token`) and is shared by routes and middleware. Do not set a different name in different places. With `session.csrf: true`, send `X-CSRF-Token` (value of the `<cookieName>_csrf` cookie) on POST/PUT/PATCH/DELETE.
8. **Roles**: `rbac.defaultRole` (default `'user'`); the role is in the JWT. Gate routes with the adapter's `requireRole('admin')` / `@Roles('admin')` after the auth middleware/guard.
9. **Do not weaken security defaults**: keep bcrypt rounds >= 12, do not return different responses for unknown emails on forgot-password (it always returns 200), do not store raw tokens.
10. When unsure about an option name, read the docs below instead of guessing.

Docs: https://david-ouatedem.github.io/auth-core/ · Machine-readable: https://david-ouatedem.github.io/auth-core/llms.txt · Full text: https://david-ouatedem.github.io/auth-core/llms-full.txt
