# Getting Started

## Prerequisites

- Node.js 18+
- PostgreSQL (or Docker)
- pnpm (recommended)

## Install

```bash
# Core + database adapter
pnpm add @authcore/core @authcore/prisma-adapter

# Pick your framework integration
pnpm add @authcore/express   # or @authcore/fastify or @authcore/nestjs

# Optional: email adapter for verification & password reset
pnpm add @authcore/resend-adapter   # or @authcore/nodemailer-adapter

# Optional: React SDK
pnpm add @authcore/react
```

## Quick Start (Express)

```ts
import express from 'express'
import { PrismaClient } from '@prisma/client'
import { prismaAdapter } from '@authcore/prisma-adapter'
import { createAuth } from '@authcore/express'

const prisma = new PrismaClient()
const app = express()
app.use(express.json())

const auth = createAuth({
  db: prismaAdapter(prisma),
  session: {
    strategy: 'jwt',
    secret: process.env.AUTH_SECRET!,
  },
})

// Mount all auth routes: /register, /login, /logout, /me, etc.
app.use('/auth', auth.router())

// Protect your own routes
app.get('/dashboard', auth.middleware(), (req, res) => {
  res.json({ user: req.user })
})

app.listen(3000)
```

## Quick Start (Fastify)

```ts
import Fastify from 'fastify'
import cookie from '@fastify/cookie'
import { PrismaClient } from '@prisma/client'
import { prismaAdapter } from '@authcore/prisma-adapter'
import { createAuth } from '@authcore/fastify'

const prisma = new PrismaClient()
const app = Fastify()

const auth = createAuth({
  db: prismaAdapter(prisma),
  session: {
    strategy: 'jwt',
    secret: process.env.AUTH_SECRET!,
  },
})

await app.register(cookie)
await app.register(auth.plugin(), { prefix: '/auth' })

app.get('/dashboard', {
  preHandler: [auth.authRequired()],
}, async (request) => {
  return { user: request.user }
})

await app.listen({ port: 3000 })
```

## Database Setup

AuthCore uses Prisma by default. Set up your schema:

```prisma
// prisma/schema.prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

model User {
  id            String   @id @default(uuid())
  email         String   @unique
  passwordHash  String
  emailVerified Boolean  @default(false)
  role          String   @default("user")
  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt
  tokens        Token[]
}

model Token {
  id        String   @id @default(uuid())
  userId    String
  type      String
  token     String   @unique
  expiresAt DateTime
  createdAt DateTime @default(now())
  user      User     @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@index([type, expiresAt])
}
```

Then push to your database:

```bash
npx prisma db push
```

## Environment Variables

```env
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/authcore"
AUTH_SECRET="your-secret-at-least-32-characters-long"
```

## Next Steps

- [Configuration Reference](/configuration) — all options
- [Adapters](/adapters/prisma) — database and email adapters
- [Integrations](/integrations/express) — Express, Fastify, NestJS, React
- [Examples](/examples/api-only) — full working apps
