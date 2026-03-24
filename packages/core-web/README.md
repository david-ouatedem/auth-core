# @authcore/core-web

> Framework-agnostic web authentication service for AuthCore. Works in any browser environment.

## Install

```bash
npm install @authcore/core-web @authcore/types
```

## Why this package?

`@authcore/core-web` provides a lightweight client-side auth service that talks to your AuthCore backend over HTTP. It has zero runtime dependencies (uses native `fetch`) and works with any frontend framework or vanilla JS.

If you're using React, use `@authcore/react` instead -- it wraps this package with hooks and context.

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

## API

### `new AuthWebService(initialState, routes?)`

Creates an auth service instance.

**`initialState`** (`AuthWebStateInterface`):

| Field | Type | Description |
|-------|------|-------------|
| `baseUrl` | `string` | Your AuthCore backend URL (e.g. `http://localhost:3000/auth`) |
| `mode` | `'api' \| 'cookie'` | `'api'` uses Bearer tokens, `'cookie'` uses httpOnly cookies |
| `persistSession` | `boolean` | Whether to save the token in localStorage (api mode only) |
| `storageKey` | `string` | localStorage key for the token |
| `user` | `PublicUser \| null` | Initial user (usually `null`) |
| `token` | `string \| null` | Initial token (usually `''`) |
| `isAuthenticated` | `boolean` | Initial auth state (usually `false`) |
| `isLoading` | `boolean` | Initial loading state |
| `error` | `string \| null` | Initial error state (usually `null`) |

**`routes`** (`AuthWebRoutesInterface`, optional) -- override default endpoint paths:

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

### Methods

| Method | Returns | Description |
|--------|---------|-------------|
| `signIn({ email, password })` | `Promise<AuthResponse>` | Sign in and update state |
| `signUp({ email, password })` | `Promise<AuthResponse>` | Register and update state |
| `signOut()` | `Promise<void>` | Sign out and clear state |
| `verifyEmail(token)` | `Promise<void>` | Verify email with token |
| `forgotPassword(email)` | `Promise<void>` | Request password reset |
| `resetPassword(token, password)` | `Promise<void>` | Reset password with token |
| `invite(email, role?)` | `Promise<void>` | Send an invitation |
| `acceptInvitation(token, password)` | `Promise<AuthResponse>` | Accept invitation and register |
| `refreshUser()` | `Promise<void>` | Fetch current user from `/me` |
| `getState()` | `AuthWebStateInterface` | Get current state snapshot |
| `subscribe(listener)` | `() => void` | Subscribe to state changes, returns unsubscribe function |

### `AuthResponse`

```ts
interface AuthResponse {
  user: PublicUser
  token?: string
}
```

### `AuthRequestError`

Thrown when the backend returns an error response.

```ts
class AuthRequestError extends Error {
  code: string | undefined
  statusCode: number
}
```

## License

[MIT](https://github.com/david-ouatedem/auth-core/blob/main/LICENSE)
