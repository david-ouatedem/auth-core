import { createAuthMiddleware } from '@authcore/nextjs/middleware'

export default createAuthMiddleware({
  publicRoutes: ['/', '/login', '/signup', '/magic-link', '/api/auth'],
  loginUrl: '/login',
})

export const config = {
  matcher: ['/((?!_next|favicon|.*\\.png).*)'],
}
