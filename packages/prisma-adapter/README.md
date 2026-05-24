# @authcore/prisma-adapter

> Prisma database adapter for AuthCore.

## Install

```bash
# Prisma 5
npm install @authcore/prisma-adapter @prisma/client
npm install --save-dev prisma

# Prisma 6 (also requires a driver adapter for your database)
npm install @authcore/prisma-adapter @prisma/client @prisma/adapter-pg pg
npm install --save-dev prisma @types/pg
```

## Usage

```ts
import { prismaAdapter } from '@authcore/prisma-adapter'
import { PrismaClient } from '@prisma/client'

// Prisma 5 (default prisma-client-js generator):
const prisma = new PrismaClient()

// Prisma 6 (new prisma-client generator — requires an explicit driver adapter):
import { PrismaPg } from '@prisma/adapter-pg'
const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! })
const prisma = new PrismaClient({ adapter })

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

> **Custom generator output:** If your `schema.prisma` uses a custom `output` path in the `generator`
> block (common in Prisma 6 monorepo setups), the import path changes. For example:
> ```ts
> // schema.prisma: generator client { output = "../generated/prisma" }
> import { PrismaClient } from '../generated/prisma/client'
> ```
> Adjust the import accordingly — the adapter itself is not affected by the output path.

## Prisma Schema

Add these models to your `schema.prisma`:

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
}
```

> **Note:** `type` is stored as a plain `String` rather than a Prisma enum. The adapter's internal
> `toCoreTokenType` validator enforces that only valid values (`EMAIL_VERIFICATION`, `PASSWORD_RESET`,
> `SESSION`, `INVITATION`) are accepted at runtime. Using `String` keeps `PrismaClientLike` portable
> across generated clients without requiring a type cast.

Then run:

```bash
npx prisma db push   # or prisma migrate dev
```

## License

[MIT](https://github.com/david-ouatedem/auth-core/blob/main/LICENSE)
