import type { EmailAdapter } from '@authcore/types'

export interface CapturedEmail {
  from: string
  to: string
  subject: string
  html: string
  text: string
}

export interface CaptureEmail {
  provider: EmailAdapter
  sent: CapturedEmail[]
  last: () => CapturedEmail | undefined
  reset: () => void
}

/**
 * In-memory EmailAdapter that records every send() call.
 * Used by core unit tests and framework integration tests to assert email contents.
 */
export function createCaptureEmail(): CaptureEmail {
  const sent: CapturedEmail[] = []
  return {
    provider: {
      async send(options) {
        sent.push({ ...options })
      },
    },
    sent,
    last: () => sent[sent.length - 1],
    reset: () => {
      sent.length = 0
    },
  }
}

/**
 * Extracts the `?token=<value>` query parameter from a URL string.
 * Throws if missing. Used in tests to recover the raw token from a captured email link.
 */
export function extractTokenFromUrl(url: string): string {
  const match = url.match(/[?&]token=([^&\s"<]+)/)
  if (!match) throw new Error(`No token query param in URL: ${url}`)
  return match[1]!
}
