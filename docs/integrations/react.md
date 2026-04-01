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
    error,             // string | null
    signUp,            // (email, password) => Promise<AuthResponse>
    signIn,            // (email, password) => Promise<AuthResponse>
    signOut,           // () => Promise<void>
    forgotPassword,    // (email) => Promise<void>
    resetPassword,     // (token, password) => Promise<void>
    verifyEmail,       // (token) => Promise<void>
    invite,            // (email, role?) => Promise<void>
    acceptInvitation,  // (token, password) => Promise<AuthResponse>
    refreshUser,       // () => Promise<void>
  } = useAuth()

  // ...
}
```

### Extended user type

If your backend returns extra fields on the user object (e.g. `avatarUrl`, `displayName`), pass a type parameter to `useAuth` to get them fully typed:

```tsx
import type { PublicUser } from '@authcore/types'

interface MyUser extends PublicUser {
  avatarUrl: string
  displayName: string
}

function Profile() {
  const { user } = useAuth<MyUser>()
  // user.avatarUrl and user.displayName are typed
}
```

Pair this with [`transformUser`](#custom-backend-integration) on `<AuthProvider>` to map your backend's response to `MyUser`.

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
| `routes` | `object` | see below | Custom route paths |
| `transformAuthResponse` | `(raw: unknown) => { user, token? }` | — | Map sign-in/sign-up response shape |
| `transformUser` | `(raw: unknown) => TUser` | — | Map /me response shape |
| `transformError` | `(body: unknown, status: number) => string` | — | Map error response to message string |
| `httpClient` | `{ get, post }` | — | Replace the built-in fetch client entirely |

### Custom route paths

```tsx
<AuthProvider
  baseUrl="/api"
  routes={{
    login: '/auth/sign-in',
    register: '/auth/sign-up',
    logout: '/auth/sign-out',
    me: '/auth/me',
    verifyEmail: '/auth/verify',
    forgotPassword: '/auth/forgot',
    resetPassword: '/auth/reset',
    invite: '/auth/invite',
    acceptInvitation: '/auth/accept',
  }}
>
```

## Custom Backend Integration

`@authcore/react` works with **any backend** — it does not require `@authcore/express` or any other AuthCore server package. Use the response transformer props to adapt your backend's JSON shape.

### Different response shapes

```tsx
// Your backend returns: { data: { user: {...} }, access_token: "..." }
<AuthProvider
  baseUrl="https://api.example.com"
  transformAuthResponse={(raw) => {
    const res = raw as { data: { user: MyUser }; access_token: string }
    return { user: res.data.user, token: res.access_token }
  }}
  transformUser={(raw) => {
    const res = raw as { data: MyUser }
    return res.data
  }}
/>
```

### Different error shapes

```tsx
// Your backend returns: { message: "Not found", statusCode: 404 }
<AuthProvider
  baseUrl="https://api.example.com"
  transformError={(body, status) => {
    const err = body as { message?: string }
    return err.message ?? `Request failed with status ${status}`
  }}
/>
```

### Custom HTTP client (Axios, etc.)

For full control — custom interceptors, retries, auth headers — supply your own HTTP client:

```tsx
import axios from 'axios'

const axiosClient = {
  get: <T>(path: string) =>
    axios.get<T>(`https://api.example.com${path}`).then(r => r.data),
  post: <T>(path: string, body?: unknown) =>
    axios.post<T>(`https://api.example.com${path}`, body).then(r => r.data),
}

<AuthProvider httpClient={axiosClient}>
  <App />
</AuthProvider>
```

When `httpClient` is provided, `baseUrl`, `mode`, and `storageKey` are ignored for request handling.

### Full custom backend example

```tsx
import type { PublicUser } from '@authcore/types'

interface MyUser extends PublicUser {
  avatarUrl: string
  plan: 'free' | 'pro'
}

function App() {
  return (
    <AuthProvider<MyUser>
      baseUrl="https://api.myapp.com"
      mode="cookie"
      routes={{ login: '/session', me: '/session/me', logout: '/session' }}
      transformAuthResponse={(raw) => {
        const r = raw as { user: MyUser; jwt: string }
        return { user: r.user, token: r.jwt }
      }}
      transformUser={(raw) => (raw as { user: MyUser }).user}
      transformError={(body) => (body as { message: string }).message}
    >
      <MyApp />
    </AuthProvider>
  )
}

// Fully typed access to extended fields anywhere in the tree
function Header() {
  const { user } = useAuth<MyUser>()
  return <img src={user?.avatarUrl} />
}
```

## Error Handling

Auth methods throw `AuthRequestError` on failure:

```tsx
import { AuthRequestError } from '@authcore/react'

try {
  await signIn(email, password)
} catch (err) {
  if (err instanceof AuthRequestError) {
    console.log(err.message)    // 'Invalid email or password'
    console.log(err.code)       // 'INVALID_CREDENTIALS' (if backend sends one)
    console.log(err.statusCode) // 401
  }
}
```

Use `transformError` if your backend's error shape doesn't match `{ error: string, code?: string }`.
