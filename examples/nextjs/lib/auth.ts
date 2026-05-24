import 'server-only'
import {
  createAuth,
  createGoogleProvider,
  type EmailAdapter,
} from '@authcore/core'
import { drizzleAdapter } from '@authcore/drizzle-adapter/sqlite'
import { createNextAuthHandler, createServerHelpers } from '@authcore/nextjs'
import { db } from '../db'

const BASE_URL = process.env['NEXT_PUBLIC_BASE_URL'] ?? 'http://localhost:3000'
const AUTH_SECRET = process.env['AUTH_SECRET']
if (!AUTH_SECRET || AUTH_SECRET.length < 32) {
  throw new Error(
    'AUTH_SECRET env var is missing or too short. Set it to a string with at least 32 characters.',
  )
}

/**
 * Dev-mode email "adapter" that prints emails to the server console.
 * Useful for trying magic-link / password-reset / invite flows locally
 * without configuring a real provider. Replace with `resendAdapter(...)`
 * or `nodemailerAdapter(...)` for production.
 */
const consoleEmail: EmailAdapter = {
  async send({ to, subject, text }) {
    console.log('─────────────── EMAIL ───────────────')
    console.log(`To:      ${to}`)
    console.log(`Subject: ${subject}`)
    console.log('')
    console.log(text)
    console.log('─────────────────────────────────────')
  },
}

// Optional Google OAuth — wired only if both env vars are present.
const googleProvider =
  process.env['GOOGLE_CLIENT_ID'] && process.env['GOOGLE_CLIENT_SECRET']
    ? createGoogleProvider({
        clientId: process.env['GOOGLE_CLIENT_ID']!,
        clientSecret: process.env['GOOGLE_CLIENT_SECRET']!,
      })
    : null

export const auth = createAuth({
  db: drizzleAdapter(db),
  session: {
    strategy: 'jwt',
    secret: AUTH_SECRET,
    expiresIn: '15m',
    refreshExpiresIn: '30d',
    csrf: true,
  },
  email: {
    provider: consoleEmail,
    from: 'auth@authcore-example.com',
  },
  features: ['emailVerification', 'passwordReset', 'magicLink'],
  appName: 'AuthCore Example',
  ...(googleProvider ? { oauth: { google: googleProvider } } : {}),
})

export const { GET, POST } = createNextAuthHandler(auth, {
  baseUrl: BASE_URL,
  useCookies: true,
  oauthSuccessRedirect: '/dashboard',
  magicLinkSuccessRedirect: '/dashboard',
})

export const { getCurrentUser, requireUser } = createServerHelpers(auth)

/** Convenience: is Google OAuth wired right now? UI uses this to show/hide the button. */
export const googleOAuthEnabled = googleProvider !== null
