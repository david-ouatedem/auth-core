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

Add `createAppleProvider` — Sign in with Apple via OAuth 2.0 + PKCE.

Apple's `client_secret` is not a static string: it's an ES256-signed JWT minted on each token exchange. AuthCore handles that for you — provide the four config fields (Services ID, Team ID, Key ID, and the `.p8` private key contents):

```ts
import { createAppleProvider } from '@authcore/core'

const apple = createAppleProvider({
  clientId: 'com.example.myapp.service',
  teamId: 'ABC1234DEF',
  keyId: 'XYZ9876ABC',
  privateKey: process.env.APPLE_PRIVATE_KEY!,
})

createAuth({ ..., oauth: { apple } })
```

Uses `response_mode=query` (vs. Apple's default `form_post`) so the existing AuthCore callback route handles the response without body-parser changes. Mounted automatically at `GET /auth/oauth/apple` + `/callback`. The `generateAppleClientSecret` helper is also exported for users who want to mint the JWT outside the provider flow.
