# AuthCore

> Devise-inspired, framework-agnostic authentication library for the JavaScript ecosystem.

AuthCore brings the simplicity and convention-over-configuration philosophy of Devise (Rails) to Node.js backends and JavaScript frontends. It works seamlessly across three deployment modes: API-only backends, frontend-only SPAs, and monorepo setups where the backend serves the frontend.

---

## Table of Contents

- [Motivation](#motivation)
- [User Stories](#user-stories)
- [Features](#features)
- [Supported Modes](#supported-modes)
- [Quick Start](#quick-start)
- [Configuration Reference](#configuration-reference)
- [API Endpoints](#api-endpoints)
- [Data Model](#data-model)
- [Project Structure](#project-structure)
- [Development Guidelines](#development-guidelines)
- [Technical Decisions](#technical-decisions)
- [Roadmap](#roadmap)

---

## Motivation

The JavaScript auth ecosystem is fragmented:

- **Passport.js** — aging, verbose, requires wiring everything yourself
- **NextAuth / Auth.js** — opinionated, Next.js-centric, not usable outside that ecosystem
- **Lucia** — discontinued
- **Clerk / Auth0** — SaaS products, you don't own your data, expensive at scale

Nobody has shipped a self-hosted, framework-agnostic auth library with the developer experience quality that Rails developers take for granted with Devise. AuthCore fixes that.

The core philosophy: **sensible defaults, zero magic, override anything.**

---

## User Stories

### As a backend developer using Express

- I want to add authentication to my Express API in under 30 minutes without reading 10 different docs
- I want registration, login, logout, email verification, and password reset to work out of the box
- I want to protect routes with a simple middleware without writing it myself
- I want to choose between JWT and session-based auth via a single config line
- I want to plug in my existing Prisma setup without rewriting my user model
- I want to receive callbacks when users register or sign in so I can run my own side effects
- I want tokens to be signed and stored securely without me having to think about it

### As a frontend developer using React

- I want a `useAuth()` hook that gives me the current user, loading state, and auth methods in one line
- I want to protect routes declaratively with a `<ProtectedRoute>` component
- I want token refresh to happen automatically in the background without me handling it
- I want the library to work whether my backend uses cookies or Authorization headers
- I want TypeScript types for everything without having to write them myself

### As a developer building a monorepo (Express + React with Vite)

- I want auth to work with httpOnly cookies automatically when backend and frontend share a domain
- I want CSRF protection handled for me without manual configuration
- I want the same React SDK to work regardless of whether I'm in API-only or monorepo mode

### As an open source contributor

- I want a clear adapter interface so I can add support for new databases (Drizzle, Mongoose, etc.)
- I want a clear adapter interface so I can add new email providers (SendGrid, Postmark, etc.)
- I want tests I can run locally with zero external dependencies
- I want contribution guidelines that are specific and not vague

### As a library maintainer

- I want the core package to have zero framework dependencies so it stays portable
- I want each adapter to be a separate npm package so users only install what they need
- I want semver discipline so users can upgrade with confidence

---

## Features

- Registration, login, logout
- Email verification flow
- Password reset via email
- JWT and session-based auth (configurable per project)
- httpOnly cookie support for monorepo / SSR setups
- Auto-detection of deployment mode
- Database-agnostic via adapters (Prisma adapter included)
- Email provider-agnostic via adapters (Resend and Nodemailer included)
- React SDK with `useAuth` hook, `AuthProvider`, and `ProtectedRoute`
- Framework adapters for Express and Fastify
- Full TypeScript with strict mode

---

## Supported Modes

| Mode | Auth Transport | Use Case |
|------|---------------|----------|
| `api` | `Authorization: Bearer <token>` header | Decoupled frontend + backend on different domains |
| `monorepo` | httpOnly cookie | Backend serves frontend, same domain |
| `auto` | Detected from request origin | Works for both, slightly more complex |

---

## Quick Start

### Backend — Express (API mode)

```bash
npm install @authcore/express @authcore/prisma-adapter @authcore/resend-adapter
```

```ts
// src/auth.ts
import { createAuth } from '@authcore/express'
import { prismaAdapter } from '@authcore/prisma-adapter'
import { resendAdapter } from '@authcore/resend-adapter'
import { prisma } from './lib/prisma'

export const auth = createAuth({
  db: prismaAdapter(prisma),
  session: {
    strategy: 'jwt',
    secret: process.env.AUTH_SECRET!,
    expiresIn: '7d',
  },
  email: {
    provider: resendAdapter(process.env.RESEND_API_KEY!),
    from: 'auth@yourdomain.com',
  },
  features: ['emailVerification', 'passwordReset'],
  mode: 'api',
})
```

```ts
// src/index.ts
import express from 'express'
import { auth } from './auth'

const app = express()
app.use(express.json())

// Mount auth routes at /auth
app.use('/auth', auth.router())

// Protect a route
app.get('/dashboard', auth.middleware(), (req, res) => {
  res.json({ user: req.user })
})
```

### Backend — Fastify

```bash
npm install @authcore/fastify @authcore/prisma-adapter
```

```ts
import Fastify from 'fastify'
import { createAuth } from '@authcore/fastify'
import { prismaAdapter } from '@authcore/prisma-adapter'

const app = Fastify()
const auth = createAuth({ db: prismaAdapter(prisma), ... })

await app.register(auth.plugin())

app.get('/dashboard', { preHandler: auth.guard() }, async (request) => {
  return { user: request.user }
})
```

### Frontend — React

```bash
npm install @authcore/react
```

```tsx
// main.tsx
import { AuthProvider } from '@authcore/react'

<AuthProvider baseUrl="https://api.yourdomain.com">
  <App />
</AuthProvider>

// Any component
import { useAuth } from '@authcore/react'

function Navbar() {
  const { user, signOut, isLoading } = useAuth()

  if (isLoading) return <Spinner />
  if (!user) return <Link to="/login">Sign in</Link>

  return (
    <div>
      <span>Hello, {user.email}</span>
      <button onClick={signOut}>Sign out</button>
    </div>
  )
}

// Protect a route
import { ProtectedRoute } from '@authcore/react'

<ProtectedRoute fallback="/login">
  <Dashboard />
</ProtectedRoute>
```

### Monorepo mode (Express + React + Vite)

```ts
// Backend
const auth = createAuth({
  ...
  mode: 'monorepo', // enables httpOnly cookies + CSRF protection
  cookies: {
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
  }
})
```

```tsx
// Frontend — no baseUrl needed, same origin
<AuthProvider>
  <App />
</AuthProvider>
```

---

## Configuration Reference

```ts
interface AuthCoreConfig {
  // Required
  db: DatabaseAdapter

  session: {
    strategy: 'jwt' | 'session'
    secret: string
    expiresIn?: string        // default: '7d' (JWT only)
    maxAge?: number           // default: 604800 (session only, seconds)
  }

  // Optional
  email?: {
    provider: EmailAdapter
    from: string
  }

  features?: Array<
    | 'emailVerification'
    | 'passwordReset'
  >

  mode?: 'api' | 'monorepo' | 'auto'  // default: 'auto'

  cookies?: {
    httpOnly?: boolean         // default: true
    secure?: boolean           // default: true in production
    sameSite?: 'strict' | 'lax' | 'none'  // default: 'lax'
    domain?: string
  }

  password?: {
    minLength?: number         // default: 8
    saltRounds?: number        // default: 12
  }

  callbacks?: {
    onSignUp?: (user: User) => void | Promise<void>
    onSignIn?: (user: User) => void | Promise<void>
    onSignOut?: (userId: string) => void | Promise<void>
    onPasswordReset?: (user: User) => void | Promise<void>
  }

  routes?: {
    // Override default route paths
    register?: string          // default: '/register'
    login?: string             // default: '/login'
    logout?: string            // default: '/logout'
    verifyEmail?: string       // default: '/verify-email'
    forgotPassword?: string    // default: '/forgot-password'
    resetPassword?: string     // default: '/reset-password'
    me?: string                // default: '/me'
  }
}
```

---

## API Endpoints

All endpoints are mounted under the prefix you configure (default: `/auth`).

### POST `/auth/register`

**Request:**
```json
{
  "email": "dave@example.com",
  "password": "securepassword123"
}
```

**Response (201):**
```json
{
  "user": { "id": "uuid", "email": "dave@example.com", "emailVerified": false },
  "token": "eyJ..." // only in API mode
}
```

**Errors:** `400` validation failed, `409` email already exists

---

### POST `/auth/login`

**Request:**
```json
{
  "email": "dave@example.com",
  "password": "securepassword123"
}
```

**Response (200):**
```json
{
  "user": { "id": "uuid", "email": "dave@example.com", "emailVerified": true },
  "token": "eyJ..." // only in API mode; monorepo sets httpOnly cookie
}
```

**Errors:** `401` invalid credentials, `403` email not verified (if emailVerification enabled)

---

### POST `/auth/logout`

Requires authentication.

**Response (200):**
```json
{ "message": "Logged out successfully" }
```

In monorepo mode, clears the auth cookie.

---

### GET `/auth/me`

Requires authentication.

**Response (200):**
```json
{
  "id": "uuid",
  "email": "dave@example.com",
  "emailVerified": true,
  "createdAt": "2025-01-01T00:00:00Z"
}
```

---

### POST `/auth/verify-email`

**Request:**
```json
{ "token": "verification-token-from-email" }
```

**Response (200):**
```json
{ "message": "Email verified successfully" }
```

---

### POST `/auth/forgot-password`

**Request:**
```json
{ "email": "dave@example.com" }
```

**Response (200):**
```json
{ "message": "If that email exists, a reset link has been sent." }
```

Always returns 200 to prevent email enumeration.

---

### POST `/auth/reset-password`

**Request:**
```json
{
  "token": "reset-token-from-email",
  "password": "newpassword123"
}
```

**Response (200):**
```json
{ "message": "Password updated successfully" }
```

---

## Data Model

AuthCore requires a `User` table and a `Token` table in your database. When using the Prisma adapter, add this to your `schema.prisma`:

```prisma
model User {
  id            String    @id @default(uuid())
  email         String    @unique
  passwordHash  String
  emailVerified Boolean   @default(false)
  createdAt     DateTime  @default(now())
  updatedAt     DateTime  @updatedAt
  tokens        Token[]
}

model Token {
  id        String    @id @default(uuid())
  userId    String
  type      TokenType
  token     String    @unique
  expiresAt DateTime
  createdAt DateTime  @default(now())
  user      User      @relation(fields: [userId], references: [id], onDelete: Cascade)
}

enum TokenType {
  EMAIL_VERIFICATION
  PASSWORD_RESET
  SESSION
}
```

You can extend the `User` model freely — AuthCore only reads and writes the fields above.

---

## Project Structure

```
authcore/
├── packages/
│   ├── core/                  # Framework-agnostic auth logic
│   │   ├── src/
│   │   │   ├── auth.ts        # Main createAuth factory
│   │   │   ├── strategies/
│   │   │   │   ├── jwt.ts
│   │   │   │   └── session.ts
│   │   │   ├── features/
│   │   │   │   ├── emailVerification.ts
│   │   │   │   └── passwordReset.ts
│   │   │   ├── adapters/
│   │   │   │   ├── database.interface.ts
│   │   │   │   └── email.interface.ts
│   │   │   ├── utils/
│   │   │   │   ├── password.ts    # bcrypt helpers
│   │   │   │   ├── token.ts       # JWT + random token helpers
│   │   │   │   └── validation.ts  # Zod schemas
│   │   │   └── types.ts
│   │   └── package.json
│   │
│   ├── express/               # Express adapter
│   │   ├── src/
│   │   │   ├── index.ts       # createAuth for Express
│   │   │   ├── router.ts      # Express Router with all auth routes
│   │   │   └── middleware.ts  # req.user attachment middleware
│   │   └── package.json
│   │
│   ├── fastify/               # Fastify adapter
│   │   ├── src/
│   │   │   ├── index.ts
│   │   │   ├── plugin.ts      # Fastify plugin
│   │   │   └── guard.ts       # preHandler hook
│   │   └── package.json
│   │
│   ├── react/                 # React frontend SDK
│   │   ├── src/
│   │   │   ├── AuthProvider.tsx
│   │   │   ├── useAuth.ts
│   │   │   ├── ProtectedRoute.tsx
│   │   │   ├── client.ts      # HTTP client, token refresh logic
│   │   │   └── types.ts
│   │   └── package.json
│   │
│   ├── prisma-adapter/
│   │   ├── src/index.ts       # Implements DatabaseAdapter interface
│   │   └── package.json
│   │
│   ├── resend-adapter/
│   │   ├── src/index.ts       # Implements EmailAdapter interface
│   │   └── package.json
│   │
│   └── nodemailer-adapter/
│       ├── src/index.ts
│       └── package.json
│
├── examples/
│   ├── api-only/              # Express API + React SPA (different ports)
│   ├── monorepo/              # Express serving React via Vite plugin
│   └── frontend-only/         # React SPA talking to a remote API
│
├── docs/                      # Vitepress documentation site
│   ├── index.md
│   ├── getting-started.md
│   ├── configuration.md
│   ├── adapters.md
│   └── examples.md
│
├── pnpm-workspace.yaml
├── tsconfig.base.json
├── vitest.config.ts
└── package.json
```

---

## Development Guidelines

### Prerequisites

- Node.js 18+
- pnpm 8+
- Postgres (for integration tests and running examples)

### Setup

```bash
git clone https://github.com/yourusername/authcore
cd authcore
pnpm install
pnpm build        # builds all packages in dependency order
```

### Development workflow

```bash
pnpm dev          # watch mode for all packages
pnpm test         # run all tests
pnpm test --filter @authcore/core   # test a specific package
```

### Running examples

```bash
cd examples/api-only
cp .env.example .env    # fill in values
pnpm install
pnpm dev                # starts both backend (3001) and frontend (5173)
```

### Coding conventions

- Strict TypeScript everywhere — no `any`, no type assertions without a comment explaining why
- Vitest for all tests
- Each feature must have unit tests in its package and integration tests in the Express adapter
- Commits follow Conventional Commits: `feat:`, `fix:`, `docs:`, `chore:`, `test:`
- Every exported function and interface must have JSDoc comments
- No runtime dependencies in `@authcore/core` — it must stay pure and portable
- Error messages must be user-facing friendly (they may be shown in UIs)

### Implementing a database adapter

A database adapter must implement the `DatabaseAdapter` interface from `@authcore/core`:

```ts
export interface DatabaseAdapter {
  findUserByEmail(email: string): Promise<User | null>
  findUserById(id: string): Promise<User | null>
  createUser(data: CreateUserInput): Promise<User>
  updateUser(id: string, data: Partial<User>): Promise<User>
  createToken(data: CreateTokenInput): Promise<Token>
  findToken(token: string, type: TokenType): Promise<Token | null>
  deleteToken(id: string): Promise<void>
  deleteExpiredTokens(): Promise<void>
}
```

See `packages/prisma-adapter/src/index.ts` as the reference implementation.

### Implementing an email adapter

```ts
export interface EmailAdapter {
  send(options: {
    to: string
    subject: string
    html: string
    text: string
  }): Promise<void>
}
```

### Security checklist for contributors

Before opening a PR that touches auth logic:

- [ ] Passwords are hashed with bcrypt (minimum 12 rounds) — never stored plain
- [ ] Tokens are random, high-entropy, and hashed before database storage
- [ ] Comparison of tokens uses timing-safe comparison (`crypto.timingSafeEqual`)
- [ ] No secrets are logged anywhere
- [ ] Password reset tokens expire (default: 1 hour)
- [ ] Email verification tokens expire (default: 24 hours)
- [ ] Forgot password endpoint always returns 200 (no email enumeration)
- [ ] All inputs are validated with Zod before processing

---

## Technical Decisions

**Why not use `jsonwebtoken` directly?**
We wrap it in our own `token.ts` utility to keep the API stable if we ever swap the underlying library, and to enforce our signing configuration consistently.

**Why Zod for validation?**
It gives us runtime validation with TypeScript type inference from the same schema — one source of truth.

**Why pnpm workspaces?**
Better performance and stricter dependency isolation than npm or yarn workspaces for monorepos.

**Why separate npm packages per adapter?**
Users should only install what they need. An Express user shouldn't pull in Fastify dependencies.

**Why support both JWT and sessions?**
JWT is stateless and scales horizontally without a shared session store. Sessions are simpler and easier to revoke. Different projects need different things — AuthCore shouldn't make that decision for you.

---

## Roadmap

### v0.1 — Core (start here)
- [ ] `@authcore/core` — password hashing, JWT signing, validation schemas, adapter interfaces
- [ ] `@authcore/prisma-adapter` — Prisma database adapter
- [ ] `@authcore/express` — Express router + middleware
- [ ] Basic tests for core and Express adapter

### v0.2 — Email features
- [ ] Email verification flow
- [ ] Password reset flow
- [ ] `@authcore/resend-adapter`
- [ ] `@authcore/nodemailer-adapter`

### v0.3 — Frontend
- [ ] `@authcore/react` — AuthProvider, useAuth, ProtectedRoute
- [ ] Token refresh logic
- [ ] Cookie support in React SDK (monorepo mode)

### v0.4 — More adapters + examples
- [ ] `@authcore/fastify`
- [ ] Example apps (all 3 modes)
- [ ] Vitepress docs site

### v0.5 — Polish
- [ ] `@authcore/drizzle-adapter`
- [ ] Vue SDK
- [ ] CLI: `npx create-authcore-app`
- [ ] Publish all packages to npm

---

## License

MIT
