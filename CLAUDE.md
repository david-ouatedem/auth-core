# CLAUDE.md — AuthCore Project Memory

## What This Project Is

AuthCore is a Devise-inspired, framework-agnostic authentication library for the JS ecosystem.
It is a **pnpm monorepo** containing multiple npm packages.

## Package Dependency Graph

```
@authcore/core          (no internal deps, standalone)
    ↑
@authcore/prisma-adapter  (peerDep: @prisma/client, @authcore/core)
    ↑
@authcore/express         (dep: express, @authcore/core)
```

## Project Structure

```
auth-core/
├── packages/
│   ├── core/               @authcore/core — types, utils, adapter interfaces, auth factory
│   ├── prisma-adapter/     @authcore/prisma-adapter — Prisma DatabaseAdapter implementation
│   └── express/            @authcore/express — Express router + middleware
├── pnpm-workspace.yaml
├── tsconfig.base.json      Shared strict TS config (ES2022, NodeNext)
├── vitest.config.ts        Workspace-mode vitest config
├── docker-compose.yml      Postgres 16 on port 5433 for integration tests
├── .env.example            DATABASE_URL + AUTH_SECRET
├── CLAUDE.md               This file
└── BUILD_LOG.md            Step-by-step build journal
```

## Key Architectural Decisions

- **No framework deps in @authcore/core** — stays portable and testable in isolation
- **Passwords**: bcrypt with ≥12 rounds, never logged
- **Tokens**: random high-entropy bytes → hashed (SHA-256) before DB storage; raw token sent to user
- **Timing-safe comparison**: `crypto.timingSafeEqual` for all token comparisons
- **Forgot password always returns 200** — prevents email enumeration
- **Zod** for all input validation (runtime + type inference from same schema)
- **Integration tests** use real Postgres via Docker — port 5433

## Current Build Status

See `BUILD_LOG.md` for step-by-step progress.

## Commands to Resume Work

```bash
# Install all deps
pnpm install

# Build all packages (core → prisma-adapter → express)
pnpm -w run build

# Run all tests
pnpm -w run test

# Run tests for a specific package
pnpm --filter @authcore/core test
pnpm --filter @authcore/prisma-adapter test
pnpm --filter @authcore/express test

# Start Postgres for integration tests
docker compose up -d

# Stop Postgres
docker compose down
```

## Environment Setup

```bash
cp .env.example .env
# Edit .env with real DATABASE_URL and AUTH_SECRET
```

## Security Rules (Never Break These)

1. Passwords hashed with bcrypt ≥12 rounds, never stored or logged plain
2. Tokens: random, hashed before storage, raw value returned to user only once
3. Token comparison: always `crypto.timingSafeEqual`
4. Forgot password: always return 200
5. All inputs validated with Zod before any processing
6. Password reset tokens expire in 1 hour, email verification in 24 hours

## Adding a New Database Adapter

Implement `DatabaseAdapter` from `@authcore/core`:

```ts
import type { DatabaseAdapter } from '@authcore/core'

export function myDbAdapter(client: MyDbClient): DatabaseAdapter {
  return {
    findUserByEmail: async (email) => { ... },
    findUserById: async (id) => { ... },
    createUser: async (data) => { ... },
    updateUser: async (id, data) => { ... },
    createToken: async (data) => { ... },
    findToken: async (token, type) => { ... },
    deleteToken: async (id) => { ... },
    deleteExpiredTokens: async () => { ... },
  }
}
```

## Adding a New Email Adapter

Implement `EmailAdapter` from `@authcore/core`:

```ts
import type { EmailAdapter } from '@authcore/core'

export function myEmailAdapter(config: MyConfig): EmailAdapter {
  return {
    send: async ({ to, subject, html, text }) => { ... },
  }
}
```
