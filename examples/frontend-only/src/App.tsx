import { AuthProvider, useAuth } from '@authcore/react'
import { useState } from 'react'

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000'

// ---------------------------------------------------------------------------
// If your backend is AuthCore-compatible, the default setup below works as-is.
//
// If your backend returns a different JSON shape, uncomment and adapt this:
//
// interface MyUser extends PublicUser {
//   displayName: string
//   avatarUrl: string
// }
//
// const providerProps = {
//   baseUrl: API_URL,
//   routes: {
//     login: '/auth/sign-in',
//     register: '/auth/sign-up',
//     logout: '/auth/sign-out',
//     me: '/auth/me',
//   },
//   transformAuthResponse: (raw: unknown) => {
//     const r = raw as { data: { user: MyUser }; access_token: string }
//     return { user: r.data.user, token: r.access_token }
//   },
//   transformUser: (raw: unknown) => (raw as { data: MyUser }).data,
//   transformError: (body: unknown) =>
//     (body as { message?: string }).message ?? 'Request failed',
// }
// ---------------------------------------------------------------------------

function Login() {
  const { signIn } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    try {
      await signIn(email, password)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed')
    }
  }

  return (
    <form onSubmit={handleSubmit}>
      <h2>Sign In</h2>
      {error && <p style={{ color: 'red' }}>{error}</p>}
      <input type="email" placeholder="Email" value={email} onChange={e => setEmail(e.target.value)} />
      <input type="password" placeholder="Password" value={password} onChange={e => setPassword(e.target.value)} />
      <button type="submit">Sign In</button>
    </form>
  )
}

function Register() {
  const { signUp } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    try {
      await signUp(email, password)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Registration failed')
    }
  }

  return (
    <form onSubmit={handleSubmit}>
      <h2>Register</h2>
      {error && <p style={{ color: 'red' }}>{error}</p>}
      <input type="email" placeholder="Email" value={email} onChange={e => setEmail(e.target.value)} />
      <input type="password" placeholder="Password (min 8 chars)" value={password} onChange={e => setPassword(e.target.value)} />
      <button type="submit">Register</button>
    </form>
  )
}

function Dashboard() {
  const { user, signOut } = useAuth()
  return (
    <div>
      <h2>Dashboard</h2>
      <p>Logged in as: {user?.email}</p>
      <button onClick={() => signOut()}>Sign Out</button>
    </div>
  )
}

function AppContent() {
  const { isAuthenticated, isLoading } = useAuth()
  const [page, setPage] = useState<'login' | 'register'>('login')

  if (isLoading) return <p>Loading...</p>

  if (isAuthenticated) return <Dashboard />

  return (
    <div>
      {page === 'login' ? <Login /> : <Register />}
      <p>
        {page === 'login' ? (
          <>Don't have an account? <button onClick={() => setPage('register')}>Register</button></>
        ) : (
          <>Already have an account? <button onClick={() => setPage('login')}>Sign In</button></>
        )}
      </p>
    </div>
  )
}

export default function App() {
  return (
    // Default: AuthCore-compatible backend (Express or Fastify adapter)
    // To connect to a custom backend, see the commented providerProps above.
    <AuthProvider baseUrl={`${API_URL}/auth`} mode="api">
      <h1>AuthCore — Frontend-Only Example</h1>
      <p style={{ color: '#666' }}>
        Pointing to API at: <code>{API_URL}</code>
      </p>
      <AppContent />
    </AuthProvider>
  )
}
