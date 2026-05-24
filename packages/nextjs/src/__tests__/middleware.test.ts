import { describe, it, expect } from 'vitest'
import { NextRequest } from 'next/server'
import { createAuthMiddleware } from '../middleware.js'

function req(path: string, cookies: Record<string, string> = {}): NextRequest {
  const url = `http://localhost${path}`
  const cookieHeader = Object.entries(cookies)
    .map(([k, v]) => `${k}=${v}`)
    .join('; ')
  return new NextRequest(url, {
    headers: cookieHeader ? { cookie: cookieHeader } : undefined,
  })
}

describe('createAuthMiddleware', () => {
  it('lets through public routes regardless of session', () => {
    const middleware = createAuthMiddleware({ publicRoutes: ['/login', '/'] })
    const res = middleware(req('/login'))
    expect(res.status).toBe(200) // NextResponse.next() is 200
  })

  it('redirects to /login when no auth cookie is present on a protected path', () => {
    const middleware = createAuthMiddleware({ publicRoutes: ['/login'] })
    const res = middleware(req('/dashboard'))
    expect(res.status).toBe(307) // NextResponse.redirect defaults to 307
    expect(res.headers.get('location')).toContain('/login')
    expect(res.headers.get('location')).toContain('next=%2Fdashboard')
  })

  it('lets through when the auth cookie is present (presence-only check)', () => {
    const middleware = createAuthMiddleware({ publicRoutes: ['/login'] })
    const res = middleware(req('/dashboard', { authcore_token: 'anything' }))
    expect(res.status).toBe(200)
  })

  it('honors a custom cookieName', () => {
    const middleware = createAuthMiddleware({
      cookieName: 'my_session',
      publicRoutes: ['/login'],
    })
    const protectedRes = middleware(req('/dashboard'))
    expect(protectedRes.status).toBe(307)

    const allowedRes = middleware(req('/dashboard', { my_session: 'jwt' }))
    expect(allowedRes.status).toBe(200)
  })

  it('treats publicRoutes as prefix matches (/api/auth covers /api/auth/login)', () => {
    const middleware = createAuthMiddleware({ publicRoutes: ['/api/auth'] })
    const res = middleware(req('/api/auth/login'))
    expect(res.status).toBe(200)
  })

  it('does NOT add ?next= when returnTo is false', () => {
    const middleware = createAuthMiddleware({
      publicRoutes: ['/login'],
      returnTo: false,
    })
    const res = middleware(req('/dashboard'))
    expect(res.headers.get('location')).not.toContain('next=')
  })

  it('redirects to a custom loginUrl when set', () => {
    const middleware = createAuthMiddleware({
      publicRoutes: ['/'],
      loginUrl: '/sign-in',
    })
    const res = middleware(req('/dashboard'))
    expect(res.headers.get('location')).toContain('/sign-in')
  })
})
