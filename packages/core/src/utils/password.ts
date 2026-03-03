import bcrypt from 'bcrypt'

const DEFAULT_SALT_ROUNDS = 12

/**
 * Hash a plain-text password using bcrypt.
 *
 * @param password - Plain-text password. Never stored or logged.
 * @param saltRounds - bcrypt cost factor (default: 12, minimum: 12)
 * @returns bcrypt hash string
 */
export async function hashPassword(
  password: string,
  saltRounds: number = DEFAULT_SALT_ROUNDS,
): Promise<string> {
  const rounds = Math.max(saltRounds, DEFAULT_SALT_ROUNDS)
  return bcrypt.hash(password, rounds)
}

/**
 * Verify a plain-text password against a bcrypt hash.
 * Uses bcrypt's internal timing-safe comparison.
 *
 * @param password - Plain-text candidate password
 * @param hash - bcrypt hash from the database
 * @returns true if the password matches the hash
 */
export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash)
}
