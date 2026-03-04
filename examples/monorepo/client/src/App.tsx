import { AuthProvider, useAuth, ProtectedRoute } from '@authcore/react'
import { useState } from 'react'

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
    <AuthProvider baseUrl="/auth" mode="cookie">
      <h1>AuthCore — Monorepo Example</h1>
      <AppContent />
    </AuthProvider>
  )
}
