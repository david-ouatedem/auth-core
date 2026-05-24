# Prisma Adapter

The official database adapter using Prisma ORM.

## Install

```bash
# Prisma 5
pnpm add @authcore/prisma-adapter @prisma/client
pnpm add -D prisma

# Prisma 6 (also requires a driver adapter for your database)
pnpm add @authcore/prisma-adapter @prisma/client @prisma/adapter-pg pg
pnpm add -D prisma @types/pg
```

## Setup

```ts
import { PrismaClient } from '@prisma/client'
import { prismaAdapter } from '@authcore/prisma-adapter'

// Prisma 5 (default prisma-client-js generator):
const prisma = new PrismaClient()

// Prisma 6 (new prisma-client generator — requires an explicit driver adapter):
import { PrismaPg } from '@prisma/adapter-pg'
const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! })
const prisma = new PrismaClient({ adapter })

const config = {
  db: prismaAdapter(prisma),
  // ...
}
```

> **Custom generator output:** If your `schema.prisma` uses a custom `output` path (common in Prisma 6
> monorepo setups), the import path changes — e.g. `from '../generated/prisma/client'` instead of
> `from '@prisma/client'`. The adapter itself is not affected.

## Schema

Add the AuthCore models to your Prisma schema:

```prisma
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

> **Note:** `type` is stored as a plain `String` rather than a Prisma enum. The adapter's internal
> `toCoreTokenType` validator enforces that only valid values (`EMAIL_VERIFICATION`, `PASSWORD_RESET`,
> `SESSION`, `INVITATION`) are accepted at runtime.

Then sync with your database:

```bash
npx prisma db push
# or for production:
npx prisma migrate dev --name init
```

## Custom Adapter

To use a different database, implement the `DatabaseAdapter` interface from `@authcore/core`:

```ts
import type { DatabaseAdapter } from '@authcore/core'

export function myAdapter(client: MyClient): DatabaseAdapter {
  return {
    findUserByEmail: async (email) => { /* ... */ },
    findUserById: async (id) => { /* ... */ },
    createUser: async (data) => { /* ... */ },
    updateUser: async (id, data) => { /* ... */ },
    createToken: async (data) => { /* ... */ },
    findToken: async (token, type) => { /* ... */ },
    deleteToken: async (id) => { /* ... */ },
    deleteExpiredTokens: async () => { /* ... */ },
  }
}
```
