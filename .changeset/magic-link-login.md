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

Add passwordless **magic-link login**. Enable via `features: ['magicLink']`.

```ts
const auth = createAuth({
  db: prismaAdapter(prisma),
  session: { strategy: 'jwt', secret: process.env.AUTH_SECRET! },
  features: ['magicLink'],
  email: { provider: resendAdapter(...), from: 'auth@app.com' },
})
```

Two new HTTP routes mounted by every framework adapter:

- `POST /auth/magic-link` — body `{ email }`. Always returns 200 (enumeration-safe). Auto-creates a user if none exists (with `emailVerified: true`, since receiving the link in the inbox proves ownership).
- `GET /auth/magic-link/consume?token=…` — single-use exchange. Mints a JWT + refresh token. Cookie mode sets the standard 3 cookies and redirects to `magicLinkSuccessRedirect`; api mode returns JSON or redirects with `#token=…&refreshToken=…` if `magicLinkSuccessRedirect` is set.

Client SDK additions:

- `signInWithMagicLink(email)` on `useAuth()` — sends the magic-link email.
- `handleMagicLinkCallback()` on `useAuth()` — call on your landing page. Handles three cases: `?token=…` direct click (calls the consume endpoint), `#token=…` fragment redirect (api mode), cookie-mode redirect (fetches `/me`).

Custom email body via `email.templates.magicLink`. Default `defaultMagicLinkTemplate` is also exported. New `Token.MAGIC_LINK` type added — Prisma users need to `db:push` to add the enum value.
