# CSRF Protection

AuthCore 0.10 ships an opt-in synchronizer-token CSRF protection for cookie mode. It's **off by default** for backward compatibility.

## When you need it

If you authenticate via httpOnly cookies (`useCookies: true`), a malicious site can trick your user's browser into sending authenticated state-changing requests to your API. `SameSite: 'lax'` (AuthCore's cookie default) blocks most cross-site POSTs but not all attack vectors. For defense in depth, enable CSRF tokens.

In Bearer-token (`mode: 'api'`) mode, CSRF is not relevant — the malicious site can't read `localStorage` from your origin.

## Enable it

```ts
const auth = createAuth({
  db: prismaAdapter(prisma),
  session: {
    strategy: 'jwt',
    secret: process.env.AUTH_SECRET!,
    csrf: true,   // ← enable CSRF
  },
})

app.use('/auth', auth.router({ useCookies: true }))
```

## How it works (synchronizer-token pattern)

1. On `register`, `login`, `refresh`, and `accept-invitation`, the server sets a third cookie: `${cookieName}_csrf`. **This cookie is NOT httpOnly** — client-side JS reads it.
2. On every state-changing request (POST/PUT/PATCH/DELETE), the client must echo the cookie value back in the `X-CSRF-Token` header.
3. Server middleware/guard verifies they match (timing-safe). Mismatch → 403 with `code: 'CSRF_INVALID'`.
4. GET / HEAD / OPTIONS are exempt.
5. First request before the cookie is set (e.g. the initial register/login) is also exempt — there's no cookie to compare against yet.

## Client integration

`@authcore/core-web` (and therefore `@authcore/react`) automatically reads `${cookieName}_csrf` from `document.cookie` on every state-changing fetch and adds the header. **No app code changes needed.**

If you have your own HTTP client outside the SDK, add the header manually:

```ts
const csrfValue = document.cookie.match(/authcore_token_csrf=([^;]+)/)?.[1]
await fetch('/api/something', {
  method: 'POST',
  credentials: 'include',
  headers: {
    'Content-Type': 'application/json',
    'X-CSRF-Token': csrfValue ?? '',
  },
  body: JSON.stringify(...)
})
```

## NestJS: wire the guard globally

NestJS's idiom is per-controller / per-route guards. To protect every state-changing endpoint, bind `CsrfGuard` globally in `main.ts`:

```ts
import { NestFactory, Reflector } from '@nestjs/core'
import cookieParser from 'cookie-parser'
import { CsrfGuard } from '@authcore/nestjs'
import { AppModule } from './app.module'

async function bootstrap() {
  const app = await NestFactory.create(AppModule)
  app.use(cookieParser())
  app.useGlobalGuards(app.get(CsrfGuard))
  await app.listen(3000)
}
bootstrap()
```

## Customizing the CSRF cookie name

The CSRF cookie is always `${session.cookieName}_csrf`. To customize, change `session.cookieName`:

```ts
session: { strategy: 'jwt', secret: SECRET, cookieName: 'my_token', csrf: true }
// → auth cookie:    my_token
// → refresh cookie: my_token_refresh
// → CSRF cookie:    my_token_csrf
```

Configure `@authcore/core-web` to read the matching name with the `csrfCookieName` option on `createFetchAuthClient`. The React SDK currently uses the default `'authcore_token_csrf'`; override by supplying a custom `httpClient` to `<AuthProvider>` if you've customized `cookieName`.
