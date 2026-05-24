import type { EmailTemplate } from '@authcore/types'

/**
 * Default email-template render functions. These match the inline content
 * shipped before 0.10 byte-for-byte so apps that don't override anything see
 * no behavior change.
 *
 * Consumers override individual templates via `EmailConfig.templates`:
 *
 * ```ts
 * createAuth({
 *   email: {
 *     provider: resendAdapter(...),
 *     from: 'auth@app.com',
 *     templates: {
 *       resetPassword: ({ link, email, ttlHours }) => ({
 *         subject: 'Reset your password',
 *         html: `<p>Hi ${email},</p><p><a href="${link}">Reset</a></p>`,
 *         text: `Reset your password: ${link}`,
 *       }),
 *     },
 *   },
 * })
 * ```
 */

export const defaultVerifyEmailTemplate: EmailTemplate<{
  email: string
  link: string
  ttlHours: number
}> = ({ link, ttlHours }) => ({
  subject: 'Verify your email address',
  html: `
      <p>Hello,</p>
      <p>Please verify your email address by clicking the link below:</p>
      <p><a href="${link}">${link}</a></p>
      <p>This link expires in ${ttlHours} hours.</p>
      <p>If you did not create an account, you can ignore this email.</p>
    `,
  text: `Please verify your email by visiting: ${link}\n\nThis link expires in ${ttlHours} hours.`,
})

export const defaultResetPasswordTemplate: EmailTemplate<{
  email: string
  link: string
  ttlHours: number
}> = ({ link, ttlHours }) => ({
  subject: 'Reset your password',
  html: `
      <p>Hello,</p>
      <p>We received a request to reset your password. Click the link below to proceed:</p>
      <p><a href="${link}">${link}</a></p>
      <p>This link expires in ${ttlHours} hour${ttlHours === 1 ? '' : 's'}.</p>
      <p>If you did not request a password reset, you can ignore this email.</p>
    `,
  text: `Reset your password by visiting: ${link}\n\nThis link expires in ${ttlHours} hour${ttlHours === 1 ? '' : 's'}.`,
})

export const defaultInvitationTemplate: EmailTemplate<{
  email: string
  link: string
  ttlHours: number
  role: string
}> = ({ link, ttlHours }) => ({
  subject: 'You have been invited',
  html: `
      <p>Hello,</p>
      <p>You have been invited to create an account. Click the link below to set your password:</p>
      <p><a href="${link}">${link}</a></p>
      <p>This link expires in ${ttlHours} hours.</p>
    `,
  text: `You have been invited. Set your password by visiting: ${link}\n\nThis link expires in ${ttlHours} hours.`,
})

export const defaultMagicLinkTemplate: EmailTemplate<{
  email: string
  link: string
  ttlMinutes: number
}> = ({ link, ttlMinutes }) => ({
  subject: 'Sign in to your account',
  html: `
      <p>Hello,</p>
      <p>Click the link below to sign in:</p>
      <p><a href="${link}">${link}</a></p>
      <p>This link expires in ${ttlMinutes} minutes and can only be used once.</p>
      <p>If you did not request this email, you can safely ignore it.</p>
    `,
  text: `Sign in by visiting: ${link}\n\nThis link expires in ${ttlMinutes} minutes and can only be used once.\n\nIf you did not request this email, you can safely ignore it.`,
})
