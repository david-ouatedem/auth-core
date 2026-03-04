# @authcore/nodemailer-adapter

> [Nodemailer](https://nodemailer.com) email adapter for AuthCore.

## Install

```bash
npm install @authcore/nodemailer-adapter nodemailer
```

## Usage

```ts
import { nodemailerAdapter } from '@authcore/nodemailer-adapter'
import { createAuth } from '@authcore/express'

const auth = createAuth({
  db: prismaAdapter(prisma),
  session: { strategy: 'jwt', secret: process.env.AUTH_SECRET! },
  email: {
    provider: nodemailerAdapter({
      host: 'smtp.example.com',
      port: 587,
      auth: { user: 'user', pass: 'pass' },
    }),
    from: 'auth@yourdomain.com',
  },
  features: ['emailVerification', 'passwordReset'],
})
```

## API

### `nodemailerAdapter(config): EmailAdapter`

```ts
nodemailerAdapter({
  host: string,
  port: number,
  secure?: boolean,   // default: false
  auth?: {
    user: string,
    pass: string,
  },
})
```

Creates an `EmailAdapter` that sends emails via SMTP using Nodemailer.

## License

[MIT](https://github.com/david-ouatedem/auth-core/blob/main/LICENSE)
