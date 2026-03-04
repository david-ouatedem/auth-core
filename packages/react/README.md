# @authcore/react

> React SDK for AuthCore — `AuthProvider`, `useAuth` hook, and `ProtectedRoute`.

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
  const { user, isAuthenticated, isLoading, signIn, signUp, signOut } = useAuth()

  if (isLoading) return <p>Loading...</p>

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

## API Reference

### `<AuthProvider>`

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `baseUrl` | `string` | — | Auth API base URL (e.g. `http://localhost:3000/auth`) |
| `mode` | `'api' \| 'cookie'` | `'api'` | `api` uses Bearer tokens, `cookie` uses httpOnly cookies |
| `storageKey` | `string` | `'authcore_token'` | localStorage key for the JWT (api mode only) |
| `children` | `ReactNode` | — | — |

### `useAuth()` Return Value

| Property | Type | Description |
|----------|------|-------------|
| `user` | `PublicUser \| null` | Current user or null |
| `isLoading` | `boolean` | True while restoring session |
| `isAuthenticated` | `boolean` | True if user is logged in |
| `signUp(email, password)` | `Promise<PublicUser>` | Register a new account |
| `signIn(email, password)` | `Promise<PublicUser>` | Sign in |
| `signOut()` | `Promise<void>` | Sign out |
| `forgotPassword(email)` | `Promise<void>` | Request password reset |
| `resetPassword(token, password)` | `Promise<void>` | Reset password |
| `verifyEmail(token)` | `Promise<void>` | Verify email address |
| `refreshUser()` | `Promise<void>` | Re-fetch current user |

### `<ProtectedRoute>`

| Prop | Type | Description |
|------|------|-------------|
| `children` | `ReactNode` | Content to show when authenticated |
| `fallback` | `ReactNode` | Shown while loading |
| `onUnauthenticated` | `() => void` | Called when user is not authenticated |

## Cookie Mode (Monorepo)

When your backend and frontend share the same domain:

```tsx
<AuthProvider baseUrl="/auth" mode="cookie">
  <App />
</AuthProvider>
```

In cookie mode, the SDK uses `credentials: 'include'` and doesn't store tokens in localStorage.

## License

[MIT](https://github.com/david-ouatedem/auth-core/blob/main/LICENSE)
