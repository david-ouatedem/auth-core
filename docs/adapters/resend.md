# Resend Adapter

Send auth emails (verification, password reset) via [Resend](https://resend.com).

## Install

```bash
pnpm add @authcore/resend-adapter
```

## Setup

```ts
import { resendAdapter } from '@authcore/resend-adapter'

const config = {
  // ...
  features: ['emailVerification', 'passwordReset'],
  email: {
    provider: resendAdapter(process.env.RESEND_API_KEY!),
    from: 'noreply@myapp.com',
  },
}
```

## Requirements

- A [Resend](https://resend.com) account and API key
- A verified sending domain in Resend
