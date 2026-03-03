import { Resend } from 'resend'
import type { EmailAdapter } from '@authcore/core'

/**
 * Create an EmailAdapter backed by the Resend email API.
 *
 * @param apiKey - Your Resend API key
 * @returns An EmailAdapter that sends emails via Resend
 *
 * @example
 * ```ts
 * import { resendAdapter } from '@authcore/resend-adapter'
 *
 * const emailAdapter = resendAdapter(process.env.RESEND_API_KEY!)
 * ```
 */
export function resendAdapter(apiKey: string): EmailAdapter {
  const client = new Resend(apiKey)

  return {
    async send({ from, to, subject, html, text }) {
      const { error } = await client.emails.send({
        from,
        to,
        subject,
        html,
        text,
      })

      if (error) {
        throw new Error(`Resend error: ${error.message}`)
      }
    },
  }
}
