// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import React from 'react'
import { AuthProvider } from '../AuthProvider.js'
import { useAuth } from '../useAuth.js'

const mockUser = {
  id: 'user-1',
  email: 'test@example.com',
  emailVerified: false,
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
}

function mockFetch(responses: Record<string, { status: number; body: unknown }>) {
  return vi.fn(async (url: string, init?: RequestInit) => {
    const method = init?.method ?? 'GET'
    const path = new URL(url).pathname
    const key = `${method} ${path}`
    const match = responses[key]

    if (!match) {
      return { ok: false, status: 404, json: async () => ({ error: 'Not found' }) }
    }

    return {
      ok: match.status >= 200 && match.status < 300,
      status: match.status,
      json: async () => match.body,
    }
  }) as unknown as typeof fetch
}

function wrapper({ children }: { children: React.ReactNode }) {
  return (
    <AuthProvider baseUrl="http://localhost:3000/auth" persistSession={false}>
      {children}
    </AuthProvider>
  )
}

describe('useAuth', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', mockFetch({
      'GET /auth/me': { status: 401, body: { error: 'Authentication required' } },
    }))
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('throws when used outside AuthProvider', () => {
    expect(() => {
      renderHook(() => useAuth())
    }).toThrow('useAuth must be used within an <AuthProvider>')
  })

  it('resolves to unauthenticated when no session exists', async () => {
    const { result } = renderHook(() => useAuth(), { wrapper })

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    expect(result.current.user).toBeNull()
    expect(result.current.isAuthenticated).toBe(false)
  })

  it('restores session when /me succeeds', async () => {
    vi.stubGlobal('fetch', mockFetch({
      'GET /auth/me': { status: 200, body: mockUser },
    }))

    function cookieWrapper({ children }: { children: React.ReactNode }) {
      return (
        <AuthProvider baseUrl="http://localhost:3000/auth" mode="cookie">
          {children}
        </AuthProvider>
      )
    }

    const { result } = renderHook(() => useAuth(), { wrapper: cookieWrapper })

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    expect(result.current.user).toEqual(mockUser)
    expect(result.current.isAuthenticated).toBe(true)
  })

  it('signUp calls /register and sets user + token', async () => {
    const fetchMock = mockFetch({
      'GET /auth/me': { status: 401, body: { error: 'Authentication required' } },
      'POST /auth/register': { status: 201, body: { user: mockUser, token: 'jwt-token-123' } },
    })
    vi.stubGlobal('fetch', fetchMock)

    const { result } = renderHook(() => useAuth(), { wrapper })

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    let returnedUser: unknown
    await act(async () => {
      returnedUser = await result.current.signUp('test@example.com', 'password123')
    })

    expect(returnedUser).toEqual({ user: mockUser, token: 'jwt-token-123' })
    expect(result.current.user).toEqual(mockUser)
    expect(result.current.isAuthenticated).toBe(true)

    // Verify the register call
    const registerCall = (fetchMock as any).mock.calls.find(
      (c: any) => (c[1] as RequestInit | undefined)?.method === 'POST',
    )
    expect(registerCall).toBeDefined()
    expect(JSON.parse((registerCall![1] as RequestInit).body as string)).toEqual({
      email: 'test@example.com',
      password: 'password123',
    })
  })

  it('signIn calls /login and sets user + token', async () => {
    const fetchMock = mockFetch({
      'GET /auth/me': { status: 401, body: { error: 'Authentication required' } },
      'POST /auth/login': { status: 200, body: { user: mockUser, token: 'jwt-token-456' } },
    })
    vi.stubGlobal('fetch', fetchMock)

    const { result } = renderHook(() => useAuth(), { wrapper })

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    await act(async () => {
      await result.current.signIn('test@example.com', 'password123')
    })

    expect(result.current.user).toEqual(mockUser)
    expect(result.current.isAuthenticated).toBe(true)
  })

  it('signOut calls /logout and clears state', async () => {
    const fetchMock = mockFetch({
      'GET /auth/me': { status: 401, body: { error: 'Authentication required' } },
      'POST /auth/login': { status: 200, body: { user: mockUser, token: 'jwt-token' } },
      'POST /auth/logout': { status: 200, body: { message: 'Logged out successfully' } },
    })
    vi.stubGlobal('fetch', fetchMock)

    const { result } = renderHook(() => useAuth(), { wrapper })

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    await act(async () => {
      await result.current.signIn('test@example.com', 'password123')
    })
    expect(result.current.isAuthenticated).toBe(true)

    await act(async () => {
      await result.current.signOut()
    })

    expect(result.current.user).toBeNull()
    expect(result.current.isAuthenticated).toBe(false)
  })

  it('signIn throws on invalid credentials', async () => {
    vi.stubGlobal('fetch', mockFetch({
      'GET /auth/me': { status: 401, body: { error: 'Authentication required' } },
      'POST /auth/login': { status: 401, body: { error: 'Invalid email or password', code: 'INVALID_CREDENTIALS' } },
    }))

    const { result } = renderHook(() => useAuth(), { wrapper })

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    await expect(
      act(() => result.current.signIn('wrong@example.com', 'badpass')),
    ).rejects.toThrow('Invalid email or password')
  })

  it('forgotPassword calls /forgot-password', async () => {
    const fetchMock = mockFetch({
      'GET /auth/me': { status: 401, body: { error: 'Authentication required' } },
      'POST /auth/forgot-password': { status: 200, body: { message: 'If that email exists, a reset link has been sent.' } },
    })
    vi.stubGlobal('fetch', fetchMock)

    const { result } = renderHook(() => useAuth(), { wrapper })

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    await act(async () => {
      await result.current.forgotPassword('test@example.com')
    })

    const forgotCall = (fetchMock as any).mock.calls.find(
      (c: any) => String(c[0]).includes('/forgot-password'),
    )
    expect(forgotCall).toBeDefined()
  })

  it('cookie mode uses credentials include', async () => {
    const fetchMock = mockFetch({
      'GET /auth/me': { status: 200, body: mockUser },
    })
    vi.stubGlobal('fetch', fetchMock)

    function cookieWrapper({ children }: { children: React.ReactNode }) {
      return (
        <AuthProvider baseUrl="http://localhost:3000/auth" mode="cookie">
          {children}
        </AuthProvider>
      )
    }

    renderHook(() => useAuth(), { wrapper: cookieWrapper })

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalled()
    })

    const meCall = (fetchMock as any).mock.calls.find(
      (c: any) => String(c[0]).includes('/me'),
    )
    expect(meCall).toBeDefined()
    expect((meCall![1] as RequestInit).credentials).toBe('include')
  })
})
