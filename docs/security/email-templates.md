# Email Templates

By default, AuthCore ships sensible plain HTML templates for the three transactional emails: verification, password reset, and invitation. For any real product you'll want to brand them, change the copy, or render them with React Email / MJML / your own engine.

Customize via `EmailConfig.templates`. Each template is a render function: `(ctx) => { subject, html, text }`. Unset templates keep the library defaults.

## Quick example

```ts
import { createAuth } from '@authcore/express'
import { resendAdapter } from '@authcore/resend-adapter'

const auth = createAuth({
  db: prismaAdapter(prisma),
  session: { strategy: 'jwt', secret: process.env.AUTH_SECRET! },
  features: ['emailVerification', 'passwordReset', 'invitation'],
  email: {
    provider: resendAdapter(process.env.RESEND_API_KEY!),
    from: 'Acme <auth@acme.com>',
    templates: {
      resetPassword: ({ email, link, ttlHours }) => ({
        subject: 'Reset your Acme password',
        html: `<p>Hi ${email},</p>
               <p><a href="${link}">Reset your password</a> — link expires in ${ttlHours}h.</p>`,
        text: `Reset your password: ${link} (expires in ${ttlHours}h)`,
      }),
    },
  },
})
```

## Template context

Each template receives a context object specific to its feature:

| Template | Context fields |
|----------|----------------|
| `verifyEmail` | `email`, `link`, `ttlHours` (24) |
| `resetPassword` | `email`, `link`, `ttlHours` (1) |
| `invitation` | `email`, `link`, `ttlHours` (48), `role` |

`link` is the fully-built URL including the token (`{baseUrl}/{path}?token={raw}`). You should never need to re-build it.

## Using React Email

`@authcore/core` is framework-agnostic — it just calls the function and forwards the result to your `EmailAdapter`. You're free to use any HTML renderer:

```ts
import { render } from '@react-email/render'
import ResetPasswordEmail from './emails/ResetPasswordEmail'

email: {
  provider: resendAdapter(process.env.RESEND_API_KEY!),
  from: 'Acme <auth@acme.com>',
  templates: {
    resetPassword: ({ email, link, ttlHours }) => ({
      subject: 'Reset your Acme password',
      html: render(<ResetPasswordEmail email={email} link={link} ttl={ttlHours} />),
      text: render(<ResetPasswordEmail email={email} link={link} ttl={ttlHours} />, { plainText: true }),
    }),
  },
},
```

## Extending the defaults

If you only want a small change (e.g. tweak the subject), import the default and spread:

```ts
import { defaultResetPasswordTemplate } from '@authcore/core'

templates: {
  resetPassword: (ctx) => ({
    ...defaultResetPasswordTemplate(ctx),
    subject: 'Reset your Acme password',  // override just the subject
  }),
},
```

## Internationalization

The render function receives the user's email — derive the user's locale however you want (a lookup in your DB, a default), then branch:

```ts
templates: {
  resetPassword: async (ctx) => {
    const locale = await getLocaleForEmail(ctx.email)  // your code
    return locale === 'fr' ? frResetEmail(ctx) : enResetEmail(ctx)
  },
},
```

Note: render functions can be `async`. The adapter `await`s them.
