# @authcore/resend-adapter

> [Resend](https://resend.com) email adapter for AuthCore.

## Install

```bash
npm install @authcore/resend-adapter resend
```

## Usage

```ts
import { resendAdapter } from '@authcore/resend-adapter'
import { createAuth } from '@authcore/express'

const auth = createAuth({
  db: prismaAdapter(prisma),
  session: { strategy: 'jwt', secret: process.env.AUTH_SECRET! },
  email: {
    provider: resendAdapter(process.env.RESEND_API_KEY!),
    from: 'auth@yourdomain.com',
  },
  features: ['emailVerification', 'passwordReset', 'invitation'],
})
```

## API

### `resendAdapter(apiKey: string): EmailAdapter`

Creates an `EmailAdapter` that sends emails via the Resend API.

## License

[MIT](https://github.com/david-ouatedem/auth-core/blob/main/LICENSE)
