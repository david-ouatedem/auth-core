# @authcore/prisma-adapter

> Prisma database adapter for AuthCore.

## Install

```bash
npm install @authcore/prisma-adapter @prisma/client prisma
```

## Usage

```ts
import { prismaAdapter } from '@authcore/prisma-adapter'
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()
const db = prismaAdapter(prisma)
```

Pass `db` to your framework adapter:

```ts
import { createAuth } from '@authcore/express'

const auth = createAuth({
  db: prismaAdapter(prisma),
  session: { strategy: 'jwt', secret: process.env.AUTH_SECRET! },
})
```

## Prisma Schema

Add these models to your `schema.prisma`:

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
}

enum TokenType {
  EMAIL_VERIFICATION
  PASSWORD_RESET
  SESSION
}
```

Then run:

```bash
npx prisma db push   # or prisma migrate dev
```

## License

[MIT](https://github.com/david-ouatedem/auth-core/blob/main/LICENSE)
