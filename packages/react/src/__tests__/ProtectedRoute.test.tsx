// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import React from 'react'
import { AuthProvider } from '../AuthProvider.js'
import { ProtectedRoute } from '../ProtectedRoute.js'

const mockUser = {
  id: 'user-1',
  email: 'test@example.com',
  emailVerified: false,
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
}

function mockFetch(meResponse: { status: number; body: unknown }) {
  return vi.fn(async () => ({
    ok: meResponse.status >= 200 && meResponse.status < 300,
    status: meResponse.status,
    json: async () => meResponse.body,
  })) as unknown as typeof fetch
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('ProtectedRoute', () => {
  it('renders fallback while loading', () => {
    // Use a fetch that never resolves to keep loading state
    vi.stubGlobal('fetch', () => new Promise(() => {}))

    render(
      <AuthProvider baseUrl="http://localhost:3000/auth" mode="cookie">
        <ProtectedRoute fallback={<div>Loading...</div>}>
          <div>Secret Content</div>
        </ProtectedRoute>
      </AuthProvider>,
    )

    expect(screen.getByText('Loading...')).toBeDefined()
    expect(screen.queryByText('Secret Content')).toBeNull()
  })

  it('renders children when authenticated', async () => {
    vi.stubGlobal('fetch', mockFetch({ status: 200, body: mockUser }))

    render(
      <AuthProvider baseUrl="http://localhost:3000/auth" mode="cookie">
        <ProtectedRoute fallback={<div>Loading...</div>}>
          <div>Secret Content</div>
        </ProtectedRoute>
      </AuthProvider>,
    )

    await waitFor(() => {
      expect(screen.getByText('Secret Content')).toBeDefined()
    })
  })

  it('calls onUnauthenticated when not authenticated', async () => {
    vi.stubGlobal('fetch', mockFetch({ status: 401, body: { error: 'Authentication required' } }))

    const onUnauth = vi.fn()

    render(
      <AuthProvider baseUrl="http://localhost:3000/auth" persistSession={false}>
        <ProtectedRoute onUnauthenticated={onUnauth}>
          <div>Secret Content</div>
        </ProtectedRoute>
      </AuthProvider>,
    )

    await waitFor(() => {
      expect(onUnauth).toHaveBeenCalled()
    })

    expect(screen.queryByText('Secret Content')).toBeNull()
  })

  it('renders nothing when not authenticated and no onUnauthenticated', async () => {
    vi.stubGlobal('fetch', mockFetch({ status: 401, body: { error: 'Authentication required' } }))

    const { container } = render(
      <AuthProvider baseUrl="http://localhost:3000/auth" persistSession={false}>
        <ProtectedRoute>
          <div>Secret Content</div>
        </ProtectedRoute>
      </AuthProvider>,
    )

    await waitFor(() => {
      expect(screen.queryByText('Secret Content')).toBeNull()
    })

    // Container should be empty (only the provider wrapper)
    expect(container.textContent).toBe('')
  })
})
