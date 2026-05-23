---
"@authcore/types": minor
"@authcore/core": minor
"@authcore/core-web": minor
"@authcore/prisma-adapter": minor
"@authcore/resend-adapter": minor
"@authcore/nodemailer-adapter": minor
"@authcore/express": minor
"@authcore/fastify": minor
"@authcore/nestjs": minor
"@authcore/react": minor
"create-authcore-app": minor
---

Add `createMicrosoftProvider` — sign in with Microsoft / Entra ID via OAuth 2.0 + PKCE.

```ts
import { createMicrosoftProvider } from '@authcore/core'

const microsoft = createMicrosoftProvider({
  clientId: process.env.MICROSOFT_CLIENT_ID!,
  clientSecret: process.env.MICROSOFT_CLIENT_SECRET!,
  // tenant: 'common' | 'organizations' | 'consumers' | '<tenant-id>'
})

createAuth({ ..., oauth: { microsoft } })
```

Reads identity claims (`sub`, `email`, `name`) directly from the OpenID Connect id_token — no extra Microsoft Graph call when the id_token is present. Falls back to `/me` when needed. Mounted automatically at `GET /auth/oauth/microsoft` + `/callback`.
