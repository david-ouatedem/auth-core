# Prisma Adapter

The official database adapter using Prisma ORM.

## Install

```bash
pnpm add @authcore/prisma-adapter @prisma/client
pnpm add -D prisma
```

## Setup

```ts
import { PrismaClient } from '@prisma/client'
import { prismaAdapter } from '@authcore/prisma-adapter'

const prisma = new PrismaClient()

const config = {
  db: prismaAdapter(prisma),
  // ...
}
```

## Schema

Add the AuthCore models to your Prisma schema:

```prisma
model User {
  id            String   @id @default(uuid())
  email         String   @unique
  passwordHash  String
  emailVerified Boolean  @default(false)
  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt
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

  @@index([type, expiresAt])
}

enum TokenType {
  EMAIL_VERIFICATION
  PASSWORD_RESET
  SESSION
}
```

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
