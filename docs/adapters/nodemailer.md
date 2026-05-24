# Nodemailer Adapter

Send auth emails via any SMTP server using [Nodemailer](https://nodemailer.com).

## Install

```bash
pnpm add @authcore/nodemailer-adapter
```

## Setup

```ts
import { nodemailerAdapter } from '@authcore/nodemailer-adapter'

const config = {
  // ...
  features: ['emailVerification', 'passwordReset', 'invitation'],
  email: {
    provider: nodemailerAdapter({
      host: 'smtp.example.com',
      port: 587,
      secure: false,
      auth: {
        user: process.env.SMTP_USER!,
        pass: process.env.SMTP_PASS!,
      },
    }),
    from: 'noreply@myapp.com',
  },
}
```

## Development

For local development, use [Ethereal](https://ethereal.email) or [MailHog](https://github.com/mailhog/MailHog):

```ts
// Ethereal — fake SMTP that captures emails
nodemailerAdapter({
  host: 'smtp.ethereal.email',
  port: 587,
  auth: {
    user: 'your-ethereal-user',
    pass: 'your-ethereal-pass',
  },
})
```
