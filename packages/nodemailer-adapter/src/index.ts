import nodemailer from 'nodemailer'
import type { EmailAdapter } from '@authcore/core'

/**
 * Configuration for the Nodemailer transport.
 */
export interface NodemailerConfig {
  host: string
  port: number
  secure?: boolean
  auth?: {
    user: string
    pass: string
  }
}

/**
 * Create an EmailAdapter backed by Nodemailer (SMTP).
 *
 * @param config - SMTP transport configuration
 * @returns An EmailAdapter that sends emails via Nodemailer
 *
 * @example
 * ```ts
 * import { nodemailerAdapter } from '@authcore/nodemailer-adapter'
 *
 * const emailAdapter = nodemailerAdapter({
 *   host: 'smtp.example.com',
 *   port: 587,
 *   secure: false,
 *   auth: { user: 'user', pass: 'pass' },
 * })
 * ```
 */
export function nodemailerAdapter(config: NodemailerConfig): EmailAdapter {
  const transporter = nodemailer.createTransport(config)

  return {
    async send({ from, to, subject, html, text }) {
      await transporter.sendMail({ from, to, subject, html, text })
    },
  }
}
