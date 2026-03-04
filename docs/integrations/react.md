# React SDK

## Install

```bash
pnpm add @authcore/react
```

## Setup

Wrap your app with `AuthProvider`:

```tsx
import { AuthProvider } from '@authcore/react'

function App() {
  return (
    <AuthProvider baseUrl="http://localhost:3000/auth" mode="api">
      <MyApp />
    </AuthProvider>
  )
}
```

### Modes

- **`api`** (default) — Bearer token auth. Token stored in localStorage.
- **`cookie`** — Cookie-based auth. Requests include `credentials: 'include'`. Use when frontend and backend share the same origin.

## `useAuth` Hook

```tsx
import { useAuth } from '@authcore/react'

function MyComponent() {
  const {
    user,              // PublicUser | null
    isAuthenticated,   // boolean
    isLoading,         // boolean
    signUp,            // (email, password) => Promise<PublicUser>
    signIn,            // (email, password) => Promise<PublicUser>
    signOut,           // () => Promise<void>
    forgotPassword,    // (email) => Promise<void>
    resetPassword,     // (token, password) => Promise<void>
    verifyEmail,       // (token) => Promise<void>
    refreshUser,       // () => Promise<void>
  } = useAuth()

  // ...
}
```

## `ProtectedRoute`

Guard component that renders children only when authenticated:

```tsx
import { ProtectedRoute } from '@authcore/react'

function App() {
  return (
    <AuthProvider baseUrl="/auth">
      <ProtectedRoute
        fallback={<p>Loading...</p>}
        onUnauthenticated={() => navigate('/login')}
      >
        <Dashboard />
      </ProtectedRoute>
    </AuthProvider>
  )
}
```

### Props

- **`fallback`** — Shown while loading (default: `null`)
- **`onUnauthenticated`** — Called when user is not authenticated (e.g. redirect to login)
- **`children`** — Rendered when authenticated

## AuthProvider Props

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `baseUrl` | `string` | required | Auth API base URL |
| `mode` | `'api' \| 'cookie'` | `'api'` | Authentication mode |
| `persistSession` | `boolean` | `true` | Store token in localStorage (api mode) |
| `storageKey` | `string` | `'authcore_token'` | localStorage key (api mode) |
| `routes` | `object` | defaults | Custom route paths |

## Error Handling

Auth methods throw `AuthRequestError` on failure:

```tsx
import { AuthRequestError } from '@authcore/react'

try {
  await signIn(email, password)
} catch (err) {
  if (err instanceof AuthRequestError) {
    console.log(err.message) // 'Invalid email or password'
    console.log(err.code)    // 'INVALID_CREDENTIALS'
    console.log(err.status)  // 401
  }
}
```
