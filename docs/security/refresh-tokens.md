# Refresh Tokens

AuthCore 0.10 introduces refresh tokens with rotation and server-side revocation. Use them to keep JWTs short-lived (15m) while still giving users long sessions (30d default), and to gain the ability to revoke a compromised session before the JWT expires.

## How it works

- **Login / register / accept-invitation** return `{ user, token, refreshToken }`. The JWT is the short-lived access token; the refresh token is a long-lived opaque secret.
- The refresh token is stored in the DB as a SHA-256 hash (same pattern as the other AuthCore tokens). The raw value is shown to the user once and never again.
- **`POST /auth/refresh`** validates the refresh token, deletes the row, and issues a fresh JWT + a new refresh token. This is "rotation" — using a refresh token invalidates it. Stolen refresh tokens become useless the next time the legitimate user refreshes.
- **`POST /auth/revoke`** deletes a single refresh token (idempotent).
- **`auth.revokeAll(userId)`** deletes every refresh token for a user — "log out everywhere". Useful after a password change or a security incident.

## Recommended defaults

```ts
const auth = createAuth({
  db: prismaAdapter(prisma),
  session: {
    strategy: 'jwt',
    secret: process.env.AUTH_SECRET!,
    expiresIn: '15m',          // short-lived JWT
    refreshExpiresIn: '30d',   // long-lived refresh (default)
  },
})
```

The client SDKs (`@authcore/core-web`, `@authcore/react`) automatically call `/refresh` when a request returns 401, retry, and surface failure as `isAuthenticated: false`. No app code needed.

## API surface

### Server (`@authcore/core`)

```ts
auth.refresh(rawRefreshToken)   // → { user, token, refreshToken }; throws 401 on invalid
auth.revoke(rawRefreshToken)    // idempotent
auth.revokeAll(userId)          // log out everywhere
```

### HTTP routes (added to all three framework adapters)

| Method | Path | Body | Description |
|--------|------|------|-------------|
| POST | `/auth/refresh` | `{ refreshToken }` (or cookie) | Returns `{ user, token, refreshToken }`; sets cookies if `useCookies` |
| POST | `/auth/revoke` | `{ refreshToken }` (or cookie) | Revoke a single token; idempotent |

### Client (`@authcore/react`)

```tsx
const { refresh, revokeSession } = useAuth()
await refresh()         // explicit refresh (the client also auto-refreshes on 401)
await revokeSession()   // server-side revoke + clear local state
```

## Cookie mode vs api mode

- **api mode** (Bearer): the refresh token lives in `localStorage` under `${storageKey}_refresh` when `persistSession: true`.
- **cookie mode**: the refresh token is set as an httpOnly cookie `${cookieName}_refresh` and the browser carries it automatically. The server reads it from `req.cookies`.

## When to revoke all sessions

- After a successful password reset (`callbacks.onPasswordReset` is a good place to call `auth.revokeAll(user.id)`).
- After an admin-flagged compromise.
- When a user actively requests "log me out everywhere" from your UI.

## Token cleanup

Expired refresh tokens are kept until `db.deleteExpiredTokens()` is called. Schedule it as a cron / background job. The Prisma adapter implementation is `deleteMany({ where: { expiresAt: { lt: new Date() } } })`.
