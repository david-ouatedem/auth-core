/**
 * EmailAdapter defines the contract for any email provider implementation.
 * Implement this interface to add support for a new email provider (SendGrid, Mailgun, etc.).
 *
 * @example
 * ```ts
 * import type { EmailAdapter } from '@authcore/core'
 *
 * export function myEmailAdapter(apiKey: string): EmailAdapter {
 *   return {
 *     send: async ({ to, subject, html, text }) => {
 *       await myEmailClient.send({ apiKey, to, subject, html, text })
 *     }
 *   }
 * }
 * ```
 */
export interface EmailAdapter {
  /**
   * Send an email.
   * Must throw on failure — AuthCore will not retry automatically.
   */
  send(options: {
    to: string
    subject: string
    html: string
    text: string
  }): Promise<void>
}
