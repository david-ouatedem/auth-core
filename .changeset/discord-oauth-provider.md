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

Add `createDiscordProvider` — sign in with Discord via OAuth 2.0 + PKCE.

```ts
import { createDiscordProvider } from '@authcore/core'

const discord = createDiscordProvider({
  clientId: process.env.DISCORD_CLIENT_ID!,
  clientSecret: process.env.DISCORD_CLIENT_SECRET!,
})

createAuth({ ..., oauth: { discord } })
```

Threads Discord's `verified` flag through to `emailVerified` — unverified Discord users hit the standard `EMAIL_NOT_VERIFIED_BY_PROVIDER` gate when linking to an existing local account. Mounted automatically at `GET /auth/oauth/discord` + `/callback`.
