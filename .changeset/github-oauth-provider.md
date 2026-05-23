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

Add `createGithubProvider` — sign in with GitHub via OAuth 2.0 + PKCE.

```ts
import { createGithubProvider } from '@authcore/core'

const github = createGithubProvider({
  clientId: process.env.GITHUB_CLIENT_ID!,
  clientSecret: process.env.GITHUB_CLIENT_SECRET!,
})

createAuth({ ..., oauth: { google, github } })
```

Always uses the user's **verified primary** email (refuses login when no verified email exists). Supports GitHub Enterprise Server via the optional `enterpriseBaseUrl` config. Mounted automatically at `GET /auth/oauth/github` + `/callback` by every framework adapter.
