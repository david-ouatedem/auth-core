# @authcore/core-web

> Framework-agnostic web authentication service. Works in any browser environment with any backend.

## Install

```bash
npm install @authcore/core-web @authcore/types
```

## Why this package?

`@authcore/core-web` provides a lightweight client-side auth service that talks to your backend over HTTP. It has zero runtime dependencies (uses native `fetch`) and works with any frontend framework or vanilla JS.

If you're using React, use `@authcore/react` instead — it wraps this package with hooks and context.

## Usage

```ts
import { AuthWebService } from '@authcore/core-web'

const auth = new AuthWebService({
  baseUrl: 'http://localhost:3000/auth',
  mode: 'api',
  persistSession: true,
  storageKey: 'authcore_token',
  user: null,
  token: '',
  isAuthenticated: false,
  isLoading: false,
  error: null,
})

// Sign in
const { user, token } = await auth.signIn({ email: 'user@example.com', password: 'password' })

// Check state
console.log(auth.getState().isAuthenticated) // true
console.log(auth.getState().user)            // { id, email, role, ... }

// Subscribe to state changes
const unsubscribe = auth.subscribe(() => {
  console.log('State changed:', auth.getState())
})

// Sign out
await auth.signOut()
```

## Custom Backend Integration

`AuthWebService` works with any backend. Use the third constructor argument to adapt response shapes, error formats, or replace the HTTP client entirely.

### Different response shapes

```ts
// Backend returns: { data: { user }, access_token: "..." }
const auth = new AuthWebService(initialState, routes, {
  transformers: {
    transformAuthResponse: (raw) => {
      const r = raw as { data: { user: MyUser }; access_token: string }
      return { user: r.data.user, token: r.access_token }
    },
    transformUser: (raw) => (raw as { data: MyUser }).data,
  },
})
```

### Different error shapes

```ts
// Backend returns: { message: "Unauthorized" }
const auth = new AuthWebService(initialState, routes, {
  transformers: {
    transformError: (body, status) => {
      const err = body as { message?: string }
      return err.message ?? `Request failed with status ${status}`
    },
  },
})
```

### Custom HTTP client

```ts
import axios from 'axios'

const auth = new AuthWebService(initialState, routes, {
  httpClient: {
    get: <T>(path: string) =>
      axios.get<T>(`https://api.example.com${path}`).then(r => r.data),
    post: <T>(path: string, body?: unknown) =>
      axios.post<T>(`https://api.example.com${path}`, body).then(r => r.data),
  },
})
```

### Extended user type

Pass a type parameter to get typed access to extra fields on the user object:

```ts
interface MyUser extends PublicUser {
  avatarUrl: string
}

const auth = new AuthWebService<MyUser>(initialState, routes, {
  transformers: {
    transformUser: (raw) => raw as MyUser,
  },
})

auth.getState().user?.avatarUrl // typed
```

## API

### `new AuthWebService<TUser>(initialState, routes?, options?)`

Creates an auth service instance.

**`initialState`** (`AuthWebStateInterface`):

| Field | Type | Description |
|-------|------|-------------|
| `baseUrl` | `string` | Your backend URL |
| `mode` | `'api' \| 'cookie'` | `'api'` uses Bearer tokens, `'cookie'` uses `credentials: 'include'` and lets the browser carry whatever cookie the backend sets (default `'authcore_token'`, controlled by the backend's `session.cookieName`) |
| `persistSession` | `boolean` | Save token in localStorage (api mode) |
| `storageKey` | `string` | localStorage key for the token |
| `user` | `TUser \| null` | Initial user (usually `null`) |
| `token` | `string \| null` | Initial token (usually `''`) |
| `isAuthenticated` | `boolean` | Initial auth state (usually `false`) |
| `isLoading` | `boolean` | Initial loading state |
| `error` | `string \| null` | Initial error state (usually `null`) |

**`routes`** (`AuthWebRoutesInterface`, optional) — override default endpoint paths:

| Field | Default |
|-------|---------|
| `register` | `/register` |
| `login` | `/login` |
| `logout` | `/logout` |
| `me` | `/me` |
| `verifyEmail` | `/verify-email` |
| `forgotPassword` | `/forgot-password` |
| `resetPassword` | `/reset-password` |
| `invite` | `/invite` |
| `acceptInvitation` | `/accept-invitation` |

**`options`** (optional):

| Field | Type | Description |
|-------|------|-------------|
| `transformers.transformAuthResponse` | `(raw: unknown) => { user: TUser, token? }` | Map sign-in/sign-up/accept-invitation response |
| `transformers.transformUser` | `(raw: unknown) => TUser` | Map /me response |
| `transformers.transformError` | `(body: unknown, status: number) => string` | Map error body to message string |
| `httpClient` | `{ get, post }` | Replace the built-in fetch client entirely |

### Methods

| Method | Returns | Description |
|--------|---------|-------------|
| `signIn({ email, password })` | `Promise<AuthResponse<TUser>>` | Sign in and update state |
| `signUp({ email, password })` | `Promise<AuthResponse<TUser>>` | Register and update state |
| `signOut()` | `Promise<void>` | Sign out and clear state |
| `verifyEmail(token)` | `Promise<void>` | Verify email with token |
| `forgotPassword(email)` | `Promise<void>` | Request password reset |
| `resetPassword(token, password)` | `Promise<void>` | Reset password with token |
| `invite(email, role?)` | `Promise<void>` | Send an invitation |
| `acceptInvitation(token, password)` | `Promise<AuthResponse<TUser>>` | Accept invitation and register |
| `refreshUser()` | `Promise<void>` | Fetch current user from `/me` |
| `getState()` | `AuthWebStateInterface<TUser>` | Get current state snapshot |
| `subscribe(listener)` | `() => void` | Subscribe to state changes, returns unsubscribe |

### `AuthResponse<TUser>`

```ts
interface AuthResponse<TUser extends PublicUser = PublicUser> {
  user: TUser
  token?: string
}
```

### `AuthRequestError`

Thrown when the backend returns a non-2xx response.

```ts
class AuthRequestError extends Error {
  code: string | undefined  // optional machine-readable code from the backend
  statusCode: number
}
```

## License

[MIT](https://github.com/david-ouatedem/auth-core/blob/main/LICENSE)
