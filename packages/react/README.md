# @authcore/react

> React SDK for AuthCore. Includes `AuthProvider`, `useAuth` hook, and `ProtectedRoute`.
> Works with any backend — not just AuthCore.

## Install

```bash
npm install @authcore/react
```

## Usage

### Setup

Wrap your app with `AuthProvider`:

```tsx
import { AuthProvider } from '@authcore/react'

function App() {
  return (
    <AuthProvider baseUrl="http://localhost:3000/auth" mode="api">
      <Main />
    </AuthProvider>
  )
}
```

### `useAuth` Hook

```tsx
import { useAuth } from '@authcore/react'

function Main() {
  const { user, isAuthenticated, isLoading, error, signIn, signUp, signOut } = useAuth()

  if (isLoading) return <p>Loading...</p>
  if (error) return <p>Error: {error}</p>

  if (!isAuthenticated) {
    return (
      <button onClick={() => signIn('user@example.com', 'password')}>
        Sign In
      </button>
    )
  }

  return (
    <div>
      <p>Hello, {user?.email}</p>
      <button onClick={() => signOut()}>Sign Out</button>
    </div>
  )
}
```

### Extended user type

If your backend returns extra fields on the user object, pass a type parameter to `useAuth`:

```tsx
import type { PublicUser } from '@authcore/types'

interface MyUser extends PublicUser {
  avatarUrl: string
  displayName: string
}

function Profile() {
  const { user } = useAuth<MyUser>()
  return <img src={user?.avatarUrl} />
}
```

Pair this with `transformUser` on `<AuthProvider>` to map your backend's response shape.

### `ProtectedRoute`

Renders children only when authenticated:

```tsx
import { ProtectedRoute } from '@authcore/react'

<ProtectedRoute
  fallback={<p>Loading...</p>}
  onUnauthenticated={() => navigate('/login')}
>
  <Dashboard />
</ProtectedRoute>
```

### Password Reset & Email Verification

```tsx
const { forgotPassword, resetPassword, verifyEmail } = useAuth()

await forgotPassword('user@example.com')
await resetPassword(token, 'new-password')
await verifyEmail(token)
```

### RBAC Hooks

```tsx
import { useRole, useHasRole } from '@authcore/react'

function AdminPanel() {
  const role = useRole()                       // 'admin', 'user', etc. or null
  const isAdmin = useHasRole('admin')          // true/false
  const isStaff = useHasRole(['admin', 'editor'])

  if (!isAdmin) return <p>Access denied</p>
  return <p>Welcome, {role}</p>
}
```

### Invitation

```tsx
const { invite, acceptInvitation } = useAuth()

await invite('new@user.com', 'editor')
const { user } = await acceptInvitation(token, 'mypassword123')
```

## Custom Backend Integration

`@authcore/react` works with **any backend**. Use the response transformer props to adapt your backend's JSON shape.

### Different response shapes

```tsx
// Backend returns: { data: { user }, access_token: "..." }
<AuthProvider
  baseUrl="https://api.example.com"
  transformAuthResponse={(raw) => {
    const r = raw as { data: { user: MyUser }; access_token: string }
    return { user: r.data.user, token: r.access_token }
  }}
  transformUser={(raw) => (raw as { data: MyUser }).data}
/>
```

### Different error shapes

```tsx
// Backend returns: { message: "Unauthorized" }
<AuthProvider
  baseUrl="https://api.example.com"
  transformError={(body, status) => {
    const err = body as { message?: string }
    return err.message ?? `Request failed with status ${status}`
  }}
/>
```

### Custom HTTP client (Axios, etc.)

```tsx
import axios from 'axios'

const client = {
  get: <T>(path: string) =>
    axios.get<T>(`https://api.example.com${path}`).then(r => r.data),
  post: <T>(path: string, body?: unknown) =>
    axios.post<T>(`https://api.example.com${path}`, body).then(r => r.data),
}

<AuthProvider httpClient={client}>
  <App />
</AuthProvider>
```

## API Reference

### `<AuthProvider>`

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `baseUrl` | `string` | required | Auth API base URL |
| `mode` | `'api' \| 'cookie'` | `'api'` | `api` uses Bearer tokens, `cookie` uses httpOnly cookies |
| `storageKey` | `string` | `'authcore_token'` | localStorage key for the token (api mode) |
| `persistSession` | `boolean` | `true` | Persist token in localStorage (api mode) |
| `routes` | `object` | see below | Override default endpoint paths |
| `transformAuthResponse` | `(raw: unknown) => { user, token? }` | — | Map sign-in/sign-up/accept-invitation response |
| `transformUser` | `(raw: unknown) => TUser` | — | Map /me response |
| `transformError` | `(body: unknown, status: number) => string` | — | Map error body to message string |
| `httpClient` | `{ get, post }` | — | Replace the built-in fetch client entirely |

**Default route paths:**

| Route | Default |
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

### `useAuth<TUser>()` Return Value

| Property | Type | Description |
|----------|------|-------------|
| `user` | `TUser \| null` | Current user or null |
| `isLoading` | `boolean` | True while restoring session |
| `isAuthenticated` | `boolean` | True if user is logged in |
| `error` | `string \| null` | Last error message, or null |
| `signUp(email, password)` | `Promise<AuthResponse<TUser>>` | Register a new account |
| `signIn(email, password)` | `Promise<AuthResponse<TUser>>` | Sign in |
| `signOut()` | `Promise<void>` | Sign out |
| `forgotPassword(email)` | `Promise<void>` | Request password reset email |
| `resetPassword(token, password)` | `Promise<void>` | Reset password |
| `verifyEmail(token)` | `Promise<void>` | Verify email address |
| `invite(email, role?)` | `Promise<void>` | Invite a new user |
| `acceptInvitation(token, password)` | `Promise<AuthResponse<TUser>>` | Accept an invitation |
| `refreshUser()` | `Promise<void>` | Re-fetch current user from `/me` |

### `<ProtectedRoute>`

| Prop | Type | Description |
|------|------|-------------|
| `children` | `ReactNode` | Content to show when authenticated |
| `fallback` | `ReactNode` | Shown while loading (default: `null`) |
| `onUnauthenticated` | `() => void` | Called when user is not authenticated |

## Cookie Mode

When your backend and frontend share the same domain:

```tsx
<AuthProvider baseUrl="/auth" mode="cookie">
  <App />
</AuthProvider>
```

In cookie mode, the SDK uses `credentials: 'include'` and does not store tokens in localStorage.

## Using Types Directly

```ts
import type { PublicUser } from '@authcore/types'
import type { AuthResponseTransformers } from '@authcore/core-web'
```

## License

[MIT](https://github.com/david-ouatedem/auth-core/blob/main/LICENSE)
