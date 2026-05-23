import { createHash } from 'node:crypto'
import type {
  DatabaseAdapter,
  CreateUserInput,
  CreateTokenInput,
  CreateOAuthAccountInput,
  OAuthAccount,
  TokenType,
  User,
  Token,
} from '@authcore/types'

/**
 * Map Prisma's TokenType enum to AuthCore's TokenType union.
 * Prisma generates its own enum type; we cast it here safely.
 */
function toCoreTokenType(type: string): TokenType {
  if (
    type === 'EMAIL_VERIFICATION' ||
    type === 'PASSWORD_RESET' ||
    type === 'SESSION' ||
    type === 'INVITATION' ||
    type === 'REFRESH'
  ) {
    return type
  }
  throw new Error(`Unknown token type: ${type}`)
}

/**
 * Map a Prisma User record to AuthCore's User type.
 */
function mapUser(prismaUser: {
  id: string
  email: string
  passwordHash: string
  emailVerified: boolean
  role: string
  createdAt: Date
  updatedAt: Date
}): User {
  return {
    id: prismaUser.id,
    email: prismaUser.email,
    passwordHash: prismaUser.passwordHash,
    emailVerified: prismaUser.emailVerified,
    role: prismaUser.role,
    createdAt: prismaUser.createdAt,
    updatedAt: prismaUser.updatedAt,
  }
}

/**
 * Map a Prisma Token record to AuthCore's Token type.
 */
function mapToken(prismaToken: {
  id: string
  userId: string
  type: string
  token: string
  expiresAt: Date
  createdAt: Date
}): Token {
  return {
    id: prismaToken.id,
    userId: prismaToken.userId,
    type: toCoreTokenType(prismaToken.type),
    token: prismaToken.token,
    expiresAt: prismaToken.expiresAt,
    createdAt: prismaToken.createdAt,
  }
}

/** Map a Prisma OAuthAccount record to AuthCore's OAuthAccount type. */
function mapOAuthAccount(row: {
  id: string
  userId: string
  provider: string
  providerAccountId: string
  accessToken: string
  refreshToken: string | null
  expiresAt: Date | null
  createdAt: Date
  updatedAt: Date
}): OAuthAccount {
  return {
    id: row.id,
    userId: row.userId,
    provider: row.provider,
    providerAccountId: row.providerAccountId,
    accessToken: row.accessToken,
    refreshToken: row.refreshToken,
    expiresAt: row.expiresAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  }
}

/**
 * Hash a raw token using SHA-256 before querying the database.
 */
function hashRawToken(rawToken: string): string {
  return createHash('sha256').update(rawToken).digest('hex')
}

/**
 * Minimal Prisma client interface — typed just enough for our needs.
 * This avoids a hard dep on generated Prisma types and keeps the adapter portable.
 */
interface PrismaUserRecord {
  id: string
  email: string
  passwordHash: string
  emailVerified: boolean
  role: string
  createdAt: Date
  updatedAt: Date
}

interface PrismaClientLike {
  user: {
    findUnique(args: { where: { email?: string; id?: string } }): Promise<PrismaUserRecord | null>
    create(args: { data: { email: string; passwordHash: string; role?: string } }): Promise<PrismaUserRecord>
    update(args: {
      where: { id: string }
      data: Partial<{
        email: string
        passwordHash: string
        emailVerified: boolean
        role: string
        updatedAt: Date
      }>
    }): Promise<PrismaUserRecord>
  }
  token: {
    create(args: {
      data: {
        userId: string
        type: string
        token: string
        expiresAt: Date
      }
    }): Promise<{
      id: string
      userId: string
      type: string
      token: string
      expiresAt: Date
      createdAt: Date
    }>
    findUnique(args: { where: { token: string } }): Promise<{
      id: string
      userId: string
      type: string
      token: string
      expiresAt: Date
      createdAt: Date
    } | null>
    delete(args: { where: { id: string } }): Promise<unknown>
    deleteMany(args: {
      where:
        | { expiresAt: { lt: Date } }
        | { userId: string; type: string }
    }): Promise<{ count: number }>
  }
  oAuthAccount: {
    findUnique(args: {
      where: { provider_providerAccountId: { provider: string; providerAccountId: string } }
    }): Promise<PrismaOAuthAccountRecord | null>
    create(args: {
      data: {
        userId: string
        provider: string
        providerAccountId: string
        accessToken: string
        refreshToken?: string | null
        expiresAt?: Date | null
      }
    }): Promise<PrismaOAuthAccountRecord>
    update(args: {
      where: { id: string }
      data: Partial<{
        accessToken: string
        refreshToken: string | null
        expiresAt: Date | null
      }>
    }): Promise<PrismaOAuthAccountRecord>
  }
}

interface PrismaOAuthAccountRecord {
  id: string
  userId: string
  provider: string
  providerAccountId: string
  accessToken: string
  refreshToken: string | null
  expiresAt: Date | null
  createdAt: Date
  updatedAt: Date
}

/**
 * Create a DatabaseAdapter backed by Prisma.
 *
 * @param prisma - An instance of PrismaClient
 * @returns DatabaseAdapter compatible with @authcore/core
 *
 * @example
 * ```ts
 * import { PrismaClient } from '@prisma/client'
 * import { prismaAdapter } from '@authcore/prisma-adapter'
 *
 * const prisma = new PrismaClient()
 * const db = prismaAdapter(prisma)
 * ```
 */
export function prismaAdapter(prisma: PrismaClientLike): DatabaseAdapter {
  return {
    async findUserByEmail(email: string): Promise<User | null> {
      const user = await prisma.user.findUnique({ where: { email } })
      return user ? mapUser(user) : null
    },

    async findUserById(id: string): Promise<User | null> {
      const user = await prisma.user.findUnique({ where: { id } })
      return user ? mapUser(user) : null
    },

    async createUser(data: CreateUserInput): Promise<User> {
      const user = await prisma.user.create({
        data: {
          email: data.email,
          passwordHash: data.passwordHash,
          ...(data.role !== undefined ? { role: data.role } : {}),
        },
      })
      return mapUser(user)
    },

    async updateUser(id: string, data: Partial<Omit<User, 'id' | 'createdAt'>>): Promise<User> {
      const user = await prisma.user.update({
        where: { id },
        data: {
          ...(data.email !== undefined ? { email: data.email } : {}),
          ...(data.passwordHash !== undefined ? { passwordHash: data.passwordHash } : {}),
          ...(data.emailVerified !== undefined ? { emailVerified: data.emailVerified } : {}),
          ...(data.role !== undefined ? { role: data.role } : {}),
        },
      })
      return mapUser(user)
    },

    async createToken(data: CreateTokenInput): Promise<Token> {
      const token = await prisma.token.create({
        data: {
          userId: data.userId,
          type: data.type,
          token: data.token, // already hashed by caller
          expiresAt: data.expiresAt,
        },
      })
      return mapToken(token)
    },

    async findToken(rawToken: string, type: TokenType): Promise<Token | null> {
      const hashedToken = hashRawToken(rawToken)
      const token = await prisma.token.findUnique({ where: { token: hashedToken } })
      if (!token) return null
      if (toCoreTokenType(token.type) !== type) return null
      return mapToken(token)
    },

    async deleteToken(id: string): Promise<void> {
      await prisma.token.delete({ where: { id } })
    },

    async deleteExpiredTokens(): Promise<void> {
      await prisma.token.deleteMany({ where: { expiresAt: { lt: new Date() } } })
    },

    async deleteTokensByUserAndType(userId: string, type: TokenType): Promise<void> {
      await prisma.token.deleteMany({ where: { userId, type } })
    },

    async findOAuthAccount(provider: string, providerAccountId: string): Promise<OAuthAccount | null> {
      const row = await prisma.oAuthAccount.findUnique({
        where: { provider_providerAccountId: { provider, providerAccountId } },
      })
      return row ? mapOAuthAccount(row) : null
    },

    async createOAuthAccount(data: CreateOAuthAccountInput): Promise<OAuthAccount> {
      const row = await prisma.oAuthAccount.create({
        data: {
          userId: data.userId,
          provider: data.provider,
          providerAccountId: data.providerAccountId,
          accessToken: data.accessToken,
          ...(data.refreshToken !== undefined ? { refreshToken: data.refreshToken } : {}),
          ...(data.expiresAt !== undefined ? { expiresAt: data.expiresAt } : {}),
        },
      })
      return mapOAuthAccount(row)
    },

    async updateOAuthAccount(
      id: string,
      data: Partial<Pick<OAuthAccount, 'accessToken' | 'refreshToken' | 'expiresAt'>>,
    ): Promise<OAuthAccount> {
      const row = await prisma.oAuthAccount.update({
        where: { id },
        data: {
          ...(data.accessToken !== undefined ? { accessToken: data.accessToken } : {}),
          ...(data.refreshToken !== undefined ? { refreshToken: data.refreshToken } : {}),
          ...(data.expiresAt !== undefined ? { expiresAt: data.expiresAt } : {}),
        },
      })
      return mapOAuthAccount(row)
    },
  }
}
