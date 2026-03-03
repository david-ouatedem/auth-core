# BUILD_LOG.md — AuthCore v0.1 Build Journal

## Overview

Building AuthCore v0.1 (Core milestone) from scratch.
Target deliverables: @authcore/core, @authcore/prisma-adapter, @authcore/express, tests.

---

## Step 0 — Root Repo Scaffolding

**Status:** ✅ Done
**Date:** 2026-03-02

**Files created:**
- `pnpm-workspace.yaml` — points at `packages/*`
- `package.json` — private monorepo root with build/test/dev scripts
- `tsconfig.base.json` — strict, ES2022, NodeNext modules
- `vitest.config.ts` — vitest with node environment, singleFork for integration tests
- `docker-compose.yml` — Postgres 16 on port 5433
- `.env.example` — DATABASE_URL + AUTH_SECRET
- `CLAUDE.md` — project memory + contributor guide
- `BUILD_LOG.md` — this file

**Key decisions:**
- Postgres exposed on port 5433 (not 5432) to avoid conflicts with local Postgres installs
- `singleFork: true` in vitest to ensure integration tests run sequentially and don't race on the DB

---

## Step 1 — @authcore/core

**Status:** ✅ Done
**Date:** 2026-03-02

**Files created:**
- `packages/core/src/types.ts` — User, Token, TokenType, CreateUserInput, CreateTokenInput
- `packages/core/src/adapters/database.interface.ts` — DatabaseAdapter interface
- `packages/core/src/adapters/email.interface.ts` — EmailAdapter interface
- `packages/core/src/utils/password.ts` — hashPassword, verifyPassword (bcrypt 12 rounds)
- `packages/core/src/utils/token.ts` — signJwt, verifyJwt, generateOpaqueToken, hashToken
- `packages/core/src/utils/validation.ts` — Zod schemas (register, login, forgotPassword, resetPassword)
- `packages/core/src/features/emailVerification.ts` — createEmailVerification, verifyEmail
- `packages/core/src/features/passwordReset.ts` — createPasswordReset, resetPassword
- `packages/core/src/auth.ts` — createAuth factory
- `packages/core/src/index.ts` — re-exports
- `packages/core/src/__tests__/password.test.ts` — unit tests for password utils
- `packages/core/src/__tests__/token.test.ts` — unit tests for token utils
- `packages/core/src/__tests__/validation.test.ts` — unit tests for Zod schemas
- `packages/core/src/__tests__/auth.test.ts` — auth factory unit tests
- `packages/core/package.json`
- `packages/core/tsconfig.json`

**Key decisions:**
- Tokens stored as SHA-256 hash of raw token; raw token returned to caller once
- `generateOpaqueToken` uses `crypto.randomBytes(32)` → hex string (64 chars)
- JWT uses HS256 algorithm only
- bcrypt salt rounds default 12, configurable

---

## Step 2 — @authcore/prisma-adapter

**Status:** ✅ Done
**Date:** 2026-03-02

**Files created:**
- `packages/prisma-adapter/prisma/schema.prisma` — User + Token models + TokenType enum
- `packages/prisma-adapter/src/index.ts` — prismaAdapter(prismaClient) → DatabaseAdapter
- `packages/prisma-adapter/src/__tests__/prismaAdapter.integration.test.ts` — integration tests (real Postgres)
- `packages/prisma-adapter/package.json`
- `packages/prisma-adapter/tsconfig.json`

**Key decisions:**
- findToken hashes the raw token before querying (token stored hashed in DB)
- deleteExpiredTokens uses `where: { expiresAt: { lt: new Date() } }`
- Integration tests connect to DATABASE_URL from .env, skip gracefully if DB unavailable

---

## Step 3 — @authcore/express

**Status:** ✅ Done
**Date:** 2026-03-02

**Files created:**
- `packages/express/src/index.ts` — createAuth(config) → { router(), middleware() }
- `packages/express/src/router.ts` — Express Router with all auth routes
- `packages/express/src/middleware.ts` — JWT/cookie verification, attaches req.user
- `packages/express/src/__tests__/auth.integration.test.ts` — integration tests (supertest + real Postgres)
- `packages/express/package.json`
- `packages/express/tsconfig.json`

**Routes:**
- POST /register
- POST /login
- POST /logout
- GET  /me (protected)
- POST /verify-email (if emailVerification feature enabled)
- POST /forgot-password (if passwordReset feature enabled)
- POST /reset-password (if passwordReset feature enabled)

---

## Step 4 — Build Verification

**Status:** ✅ Done
**Date:** 2026-03-02

```bash
pnpm install     # ✅
pnpm build       # ✅ core → prisma-adapter → express
pnpm test        # ✅ unit tests pass; integration tests require docker compose up -d
```
