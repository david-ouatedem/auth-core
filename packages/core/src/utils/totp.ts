import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto'

/**
 * RFC 6238 (TOTP) and RFC 4226 (HOTP) primitives.
 *
 * Implemented from the spec — zero dependencies. We deliberately keep the
 * audit surface small: 100 lines of straightforward code beats a third-party
 * library whose changelog we have to follow.
 *
 * Algorithm summary:
 *   HOTP(K, C) = Truncate(HMAC-SHA1(K, big-endian-uint64(C)))
 *   Truncate picks 4 bytes at a dynamic offset, masks the MSB, and takes
 *   mod 10^6 to produce a 6-digit code.
 *   TOTP(K) = HOTP(K, floor(now / 30))
 */

const TOTP_DIGITS = 6
const TOTP_PERIOD_SECONDS = 30
const TOTP_ALGORITHM = 'sha1' // RFC 6238 default; what every authenticator app expects

/** RFC 4648 Base32 alphabet (uppercase, no padding for our use). */
const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'

/**
 * Encode raw bytes to base32 (RFC 4648, no padding). Authenticator apps and
 * QR codes universally expect base32 for the secret.
 */
export function base32Encode(bytes: Buffer): string {
  let bits = 0
  let value = 0
  let output = ''
  for (const byte of bytes) {
    value = (value << 8) | byte
    bits += 8
    while (bits >= 5) {
      output += BASE32_ALPHABET[(value >>> (bits - 5)) & 0x1f]
      bits -= 5
    }
  }
  if (bits > 0) {
    output += BASE32_ALPHABET[(value << (5 - bits)) & 0x1f]
  }
  return output
}

/**
 * Decode a base32 string back to bytes. Tolerates lowercase + whitespace +
 * trailing `=` padding so we accept whatever a user paste happens to contain.
 */
export function base32Decode(encoded: string): Buffer {
  const cleaned = encoded.replace(/=+$/, '').replace(/\s/g, '').toUpperCase()
  const bytes: number[] = []
  let bits = 0
  let value = 0
  for (const char of cleaned) {
    const idx = BASE32_ALPHABET.indexOf(char)
    if (idx === -1) {
      throw new Error(`Invalid base32 character: ${char}`)
    }
    value = (value << 5) | idx
    bits += 5
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 0xff)
      bits -= 8
    }
  }
  return Buffer.from(bytes)
}

/**
 * Generate a new TOTP secret: 20 random bytes (160 bits, the RFC 4226 minimum
 * recommended length), base32-encoded.
 */
export function generateTotpSecret(): string {
  return base32Encode(randomBytes(20))
}

/**
 * Generate a TOTP code for the given secret and timestamp (defaults to now).
 *
 * @param secret - Base32-encoded secret
 * @param timestamp - Unix timestamp in seconds (default: current time)
 * @returns 6-digit numeric code as a zero-padded string
 */
export function generateTotpCode(
  secret: string,
  timestamp: number = Math.floor(Date.now() / 1000),
): string {
  const step = Math.floor(timestamp / TOTP_PERIOD_SECONDS)
  return hotp(base32Decode(secret), step)
}

/**
 * Verify a TOTP code against a secret. Accepts the current 30-second window
 * AND ±1 step (i.e. ±30 seconds) to absorb clock drift between server and
 * authenticator app — RFC 6238 §5.2 recommends this tolerance.
 *
 * Returns true on match. Uses timing-safe comparison.
 *
 * @param secret - Base32-encoded secret stored at enrollment time
 * @param code   - User-supplied 6-digit code (string; may include whitespace)
 * @param window - Number of steps before AND after current to accept. Default 1.
 * @param timestamp - Optional fixed timestamp (for testing)
 */
export function verifyTotpCode(
  secret: string,
  code: string,
  window: number = 1,
  timestamp: number = Math.floor(Date.now() / 1000),
): boolean {
  const normalized = code.replace(/\s/g, '')
  if (!/^\d{6}$/.test(normalized)) return false

  const key = base32Decode(secret)
  const currentStep = Math.floor(timestamp / TOTP_PERIOD_SECONDS)

  for (let offset = -window; offset <= window; offset++) {
    const candidate = hotp(key, currentStep + offset)
    if (safeStringEqual(candidate, normalized)) return true
  }
  return false
}

/**
 * Build an `otpauth://totp/...` URL for QR code rendering. Authenticator apps
 * (Google Authenticator, 1Password, Authy, etc.) parse this URL format.
 *
 * @param secret    - Base32-encoded secret
 * @param accountName - Usually the user's email
 * @param issuer    - Your app name (e.g. "MyApp")
 */
export function buildOtpauthUrl(params: {
  secret: string
  accountName: string
  issuer: string
}): string {
  const { secret, accountName, issuer } = params
  // Per Google Authenticator spec, label is "Issuer:AccountName" (URL-encoded).
  const label = `${encodeURIComponent(issuer)}:${encodeURIComponent(accountName)}`
  const query = new URLSearchParams({
    secret,
    issuer,
    algorithm: 'SHA1',
    digits: String(TOTP_DIGITS),
    period: String(TOTP_PERIOD_SECONDS),
  })
  return `otpauth://totp/${label}?${query.toString()}`
}

/**
 * Generate `count` user-friendly recovery codes. Format: `xxxx-xxxx-xxxx`
 * (12 chars + 2 dashes), drawn from an unambiguous alphabet (no 0/O/1/I/L).
 *
 * Recovery codes are intentionally meant to be one-time backups when a user
 * loses their authenticator device. Store the SHA-256 hash; show the raw
 * value to the user exactly once.
 */
export function generateRecoveryCodes(count = 10): string[] {
  const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789' // 31 chars, no 0/O/1/I/L
  const codes: string[] = []
  for (let i = 0; i < count; i++) {
    const groups: string[] = []
    for (let g = 0; g < 3; g++) {
      const bytes = randomBytes(4)
      let s = ''
      for (let j = 0; j < 4; j++) {
        s += ALPHABET[bytes[j]! % ALPHABET.length]
      }
      groups.push(s)
    }
    codes.push(groups.join('-'))
  }
  return codes
}

// --- internals ---

function hotp(key: Buffer, counter: number): string {
  // RFC 4226: counter is a 64-bit big-endian unsigned integer.
  const counterBuf = Buffer.alloc(8)
  // JavaScript bitwise ops are 32-bit. Split into two halves.
  const hi = Math.floor(counter / 0x100000000)
  const lo = counter >>> 0
  counterBuf.writeUInt32BE(hi, 0)
  counterBuf.writeUInt32BE(lo, 4)

  const hmac = createHmac(TOTP_ALGORITHM, key).update(counterBuf).digest()

  // Dynamic truncation: offset is the low 4 bits of the last byte.
  const offset = hmac[hmac.length - 1]! & 0x0f
  const binary =
    ((hmac[offset]! & 0x7f) << 24) |
    ((hmac[offset + 1]! & 0xff) << 16) |
    ((hmac[offset + 2]! & 0xff) << 8) |
    (hmac[offset + 3]! & 0xff)

  return String(binary % 10 ** TOTP_DIGITS).padStart(TOTP_DIGITS, '0')
}

function safeStringEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  return timingSafeEqual(Buffer.from(a, 'utf8'), Buffer.from(b, 'utf8'))
}
