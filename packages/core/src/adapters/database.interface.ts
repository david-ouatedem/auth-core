import type { User, Token, TokenType, CreateUserInput, CreateTokenInput } from '../types.js'

/**
 * DatabaseAdapter defines the contract that any database implementation must fulfill.
 * Implement this interface to add support for a new database (Drizzle, Mongoose, etc.).
 *
 * @example
 * ```ts
 * import type { DatabaseAdapter } from '@authcore/core'
 *
 * export function myAdapter(client: MyClient): DatabaseAdapter {
 *   return {
 *     findUserByEmail: (email) => client.user.findUnique({ where: { email } }),
 *     // ...
 *   }
 * }
 * ```
 */
export interface DatabaseAdapter {
  /** Find a user by their email address. Returns null if not found. */
  findUserByEmail(email: string): Promise<User | null>

  /** Find a user by their ID. Returns null if not found. */
  findUserById(id: string): Promise<User | null>

  /** Create a new user record. */
  createUser(data: CreateUserInput): Promise<User>

  /** Update fields on an existing user. */
  updateUser(id: string, data: Partial<Omit<User, 'id' | 'createdAt'>>): Promise<User>

  /**
   * Create a new token record.
   * The `token` field in `data` must be the SHA-256 hash of the raw token.
   */
  createToken(data: CreateTokenInput): Promise<Token>

  /**
   * Find a token record by the raw token value and type.
   * Implementations MUST hash the raw token before querying.
   */
  findToken(rawToken: string, type: TokenType): Promise<Token | null>

  /** Delete a token by its ID. */
  deleteToken(id: string): Promise<void>

  /** Delete all expired tokens. Call periodically for housekeeping. */
  deleteExpiredTokens(): Promise<void>
}
