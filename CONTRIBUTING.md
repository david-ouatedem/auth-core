# Contributing to AuthCore

Thanks for your interest in contributing to AuthCore! This guide will help you get started.

## Getting Started

### Prerequisites

- Node.js >= 18
- pnpm >= 10
- Docker (for integration tests)

### Fork the repository

1. Go to [github.com/david-ouatedem/auth-core](https://github.com/david-ouatedem/auth-core)
2. Click the **Fork** button in the top right
3. Clone your fork and set up the upstream remote:

```bash
git clone https://github.com/<your-username>/auth-core.git
cd auth-core
git remote add upstream https://github.com/david-ouatedem/auth-core.git

# Install dependencies
pnpm install

# Copy environment file
cp .env.example .env

# Start Postgres for integration tests
docker compose up -d

# Push the Prisma schema to the test database
DATABASE_URL="postgresql://authcore:authcore_secret@localhost:5433/authcore_test" \
  pnpm --filter @authcore/prisma-adapter exec prisma db push

# Build all packages (types → core-web → everything else)
pnpm build

# Run all tests
pnpm test
```

## Project Structure

This is a pnpm monorepo. Packages are in `packages/` and build in dependency order:

```
@authcore/types             (standalone — shared type definitions)
@authcore/core              (depends on types)
@authcore/core-web          (depends on types — framework-agnostic web auth service)
@authcore/prisma-adapter    (depends on core)
@authcore/resend-adapter    (standalone)
@authcore/nodemailer-adapter(standalone)
@authcore/express           (depends on core)
@authcore/fastify           (depends on core)
@authcore/nestjs            (depends on core)
@authcore/react             (depends on core-web, types)
create-authcore-app         (standalone)
```

## Development Workflow

### Branching

- `main` is the release branch. Do not push directly.
- `develop` is the integration branch. Feature branches merge here first.
- Name feature branches descriptively: `feat/add-drizzle-adapter`, `fix/token-expiry-check`.

### Running Tests

```bash
# All tests (unit + integration)
pnpm test

# Single package
pnpm --filter @authcore/core test

# Watch mode
pnpm test:watch
```

Integration tests require a running Postgres instance on port 5433. Start it with `docker compose up -d`.

### Building

```bash
# Build all packages in dependency order
pnpm build

# Build a single package
pnpm --filter @authcore/express build

# Type check without emitting
pnpm lint
```

## Making Changes

### 1. Pick an issue

Check the [issues](https://github.com/david-ouatedem/auth-core/issues) page. Look for issues labeled `good first issue` if you're new to the project.

### 2. Create a branch

```bash
# 1. Fork the repo on GitHub (https://github.com/david-ouatedem/auth-core)

# 2. Clone your fork
git clone https://github.com/your-username/auth-core.git
cd auth-core

# 3. Add the original repo as upstream
git remote add upstream https://github.com/david-ouatedem/auth-core.git

# 4. Create a branch for your feature
git checkout -b feat/your-feature
```

### 3. Write code

Follow the patterns already in the codebase:

- **TypeScript strict mode** everywhere
- **Zod** for input validation at system boundaries
- **No `any` types** unless absolutely necessary
- Keep `@authcore/core` free of framework dependencies
- Export types from `index.ts` in each package

### 4. Write tests

- Unit tests go next to the source: `src/__tests__/thing.test.ts`
- Integration tests that need a database use the `describeIf(DATABASE_URL)` pattern to skip gracefully
- Aim for meaningful coverage of new functionality

### 5. Submit a pull request

- Target the `develop` branch of the original repo
- Fill in the PR template
- Keep PRs focused. One feature or fix per PR.
- Make sure `pnpm build` and `pnpm test` pass locally before pushing
- Push to your fork: `git push -u origin feat/your-feature`
- Open a Pull Request from your branch on GitHub

## Adding a New Database Adapter

Create a new package in `packages/` and implement the `DatabaseAdapter` interface from `@authcore/core`:

```ts
import type { DatabaseAdapter } from '@authcore/core'

export function myAdapter(client: MyClient): DatabaseAdapter {
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

See `packages/prisma-adapter` for a reference implementation.

## Adding a New Email Adapter

Implement the `EmailAdapter` interface from `@authcore/core`:

```ts
import type { EmailAdapter } from '@authcore/core'

export function myEmailAdapter(config: MyConfig): EmailAdapter {
  return {
    send: async ({ to, subject, html, text }) => { ... },
  }
}
```

See `packages/resend-adapter` or `packages/nodemailer-adapter` for reference.

## Adding a New Framework Adapter

Framework adapters wrap `@authcore/core` and expose framework-native APIs. Your adapter should:

1. Accept an `AuthCoreConfig` and create a core instance with `createAuth(config)`
2. Expose an authentication middleware/guard
3. Expose a role-checking middleware/guard
4. Register all auth routes (register, login, logout, me, verify-email, forgot-password, reset-password, invite, accept-invitation)
5. Map `AuthError` to the framework's HTTP error type — 401 for missing/invalid auth, 403 only for role denials
6. **Read `core.config.session.cookieName` once and thread it into BOTH the cookie writer (route handlers) AND the cookie reader (middleware/guard).** If the two paths use different names you get a permanent 401 loop on `/me` — this is the bug we fixed in 0.9. Per-router/per-plugin `cookieName` overrides are allowed for backward compatibility, but they MUST be threaded through to the middleware too.
7. Build `resetUrl` as `${baseUrl}${paths.resetPassword}` and pass it as `auth.forgotPassword(body, { resetUrl })`. Mirror the existing `inviteUrl` pattern at `packages/express/src/router.ts:139`. Core throws `MISSING_URL` (500) if a caller forgets — this is intentional so a missing plumbing step fails loudly instead of silently leaking config into emails.

See `packages/express`, `packages/fastify`, or `packages/nestjs` for reference.

## Security

If you discover a security vulnerability, **do not open a public issue**. Instead, see [SECURITY.md](SECURITY.md) for responsible disclosure instructions.

When contributing code, keep these rules in mind:

- Passwords are hashed with bcrypt (12+ rounds), never stored or logged in plain text
- Tokens are random, SHA-256 hashed before storage, compared with `crypto.timingSafeEqual`
- Password reset always returns 200 (prevents email enumeration)
- All user input is validated with Zod before processing

## Code Style

- No semicolons (the project uses a no-semicolons style)
- Single quotes for strings
- 2-space indentation
- Prefer `const` over `let`, avoid `var`
- Use descriptive variable names

## License

By contributing, you agree that your contributions will be licensed under the [MIT License](LICENSE).
