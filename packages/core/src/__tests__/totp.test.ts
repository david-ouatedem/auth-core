import { describe, it, expect } from 'vitest'
import {
  base32Encode,
  base32Decode,
  generateTotpSecret,
  generateTotpCode,
  verifyTotpCode,
  buildOtpauthUrl,
  generateRecoveryCodes,
} from '../utils/totp.js'

describe('base32', () => {
  it('round-trips arbitrary bytes', () => {
    const cases = [
      Buffer.from([0]),
      Buffer.from([0xff]),
      Buffer.from('hello'),
      Buffer.from([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]),
      Buffer.from(new Array(20).fill(0).map((_, i) => i * 13)),
    ]
    for (const input of cases) {
      const encoded = base32Encode(input)
      const decoded = base32Decode(encoded)
      expect(decoded.equals(input)).toBe(true)
    }
  })

  it('matches a known RFC 4648 vector', () => {
    // RFC 4648 §10: "foobar" → "MZXW6YTBOI======" (no padding in our encoder)
    expect(base32Encode(Buffer.from('foobar'))).toBe('MZXW6YTBOI')
    expect(base32Decode('MZXW6YTBOI').toString()).toBe('foobar')
  })

  it('decodes input with whitespace and padding', () => {
    expect(base32Decode('MZXW 6YTBOI ====').toString()).toBe('foobar')
    expect(base32Decode('mzxw6ytboi').toString()).toBe('foobar') // lowercase
  })

  it('throws on invalid characters', () => {
    expect(() => base32Decode('MZXW6Y!BOI')).toThrow(/Invalid base32/)
  })
})

describe('generateTotpSecret', () => {
  it('returns a 32-character base32 string (20 bytes)', () => {
    const secret = generateTotpSecret()
    expect(secret).toHaveLength(32)
    expect(secret).toMatch(/^[A-Z2-7]+$/)
    // Each call returns a fresh secret
    expect(generateTotpSecret()).not.toBe(secret)
  })
})

describe('generateTotpCode / verifyTotpCode', () => {
  // The single most-cited TOTP test vector: RFC 6238 Appendix B.
  // Secret "12345678901234567890" (20 ASCII bytes) at t=59s → code 287082 (SHA1).
  const RFC_SECRET = base32Encode(Buffer.from('12345678901234567890'))

  it('matches RFC 6238 vectors (SHA1)', () => {
    const cases: Array<{ t: number; expected: string }> = [
      { t: 59, expected: '287082' },
      { t: 1111111109, expected: '081804' },
      { t: 1111111111, expected: '050471' },
      { t: 1234567890, expected: '005924' },
      { t: 2000000000, expected: '279037' },
    ]
    for (const { t, expected } of cases) {
      expect(generateTotpCode(RFC_SECRET, t)).toBe(expected)
    }
  })

  it('verify accepts a code generated for the current 30s window', () => {
    const secret = generateTotpSecret()
    const now = Math.floor(Date.now() / 1000)
    const code = generateTotpCode(secret, now)
    expect(verifyTotpCode(secret, code, 1, now)).toBe(true)
  })

  it('verify accepts ±1 step (30s clock drift)', () => {
    const secret = generateTotpSecret()
    const now = 1700000000
    const previousStepCode = generateTotpCode(secret, now - 30)
    const nextStepCode = generateTotpCode(secret, now + 30)
    expect(verifyTotpCode(secret, previousStepCode, 1, now)).toBe(true)
    expect(verifyTotpCode(secret, nextStepCode, 1, now)).toBe(true)
  })

  it('verify rejects a code from ±2 steps away with default window', () => {
    const secret = generateTotpSecret()
    const now = 1700000000
    const farFutureCode = generateTotpCode(secret, now + 90)
    expect(verifyTotpCode(secret, farFutureCode, 1, now)).toBe(false)
  })

  it('verify rejects malformed codes (length, non-digit)', () => {
    const secret = generateTotpSecret()
    expect(verifyTotpCode(secret, '12345')).toBe(false) // 5 digits
    expect(verifyTotpCode(secret, '1234567')).toBe(false) // 7 digits
    expect(verifyTotpCode(secret, 'abcdef')).toBe(false)
    // '12 34 56' is well-formed after whitespace strip but won't match a random secret
    expect(verifyTotpCode(secret, '12 34 56')).toBe(false)
  })

  it('verify tolerates whitespace in input', () => {
    const secret = generateTotpSecret()
    const now = 1700000000
    const code = generateTotpCode(secret, now)
    // Insert spaces in the middle
    const spaced = `${code.slice(0, 3)} ${code.slice(3)}`
    expect(verifyTotpCode(secret, spaced, 1, now)).toBe(true)
  })

  it('verify rejects a wrong code with timing-safe semantics', () => {
    const secret = generateTotpSecret()
    expect(verifyTotpCode(secret, '000000')).toBe(false)
    expect(verifyTotpCode(secret, '999999')).toBe(false)
  })
})

describe('buildOtpauthUrl', () => {
  it('produces a parseable otpauth://totp URL with the expected query params', () => {
    const url = buildOtpauthUrl({
      secret: 'JBSWY3DPEHPK3PXP',
      accountName: 'alice@example.com',
      issuer: 'MyApp',
    })
    const parsed = new URL(url)
    expect(parsed.protocol).toBe('otpauth:')
    expect(parsed.host).toBe('totp')
    expect(parsed.pathname).toBe('/MyApp:alice%40example.com')
    expect(parsed.searchParams.get('secret')).toBe('JBSWY3DPEHPK3PXP')
    expect(parsed.searchParams.get('issuer')).toBe('MyApp')
    expect(parsed.searchParams.get('algorithm')).toBe('SHA1')
    expect(parsed.searchParams.get('digits')).toBe('6')
    expect(parsed.searchParams.get('period')).toBe('30')
  })

  it('URL-encodes issuer and accountName so spaces survive', () => {
    const url = buildOtpauthUrl({
      secret: 'A',
      accountName: 'name with spaces',
      issuer: 'My App',
    })
    expect(url).toContain('/My%20App:name%20with%20spaces')
  })
})

describe('generateRecoveryCodes', () => {
  it('returns 10 codes by default, all distinct', () => {
    const codes = generateRecoveryCodes()
    expect(codes).toHaveLength(10)
    expect(new Set(codes).size).toBe(10)
  })

  it('matches the xxxx-xxxx-xxxx format', () => {
    const codes = generateRecoveryCodes(3)
    for (const code of codes) {
      expect(code).toMatch(/^[A-Z2-9]{4}-[A-Z2-9]{4}-[A-Z2-9]{4}$/)
    }
  })

  it('uses an unambiguous alphabet (no 0/O/1/I/L)', () => {
    for (let i = 0; i < 5; i++) {
      const codes = generateRecoveryCodes(20)
      for (const code of codes) {
        expect(code).not.toMatch(/[01OIL]/)
      }
    }
  })
})
