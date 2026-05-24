/**
 * @authcore/nextjs — Next.js (App Router) adapter for AuthCore.
 *
 * Top-level barrel for **server-only** entry points: the route handler factory
 * and the server-side `getCurrentUser` helpers. The middleware factory lives at
 * `@authcore/nextjs/middleware` (so it can be imported into `middleware.ts`
 * without dragging in Node-only deps). The client components live at
 * `@authcore/nextjs/client`.
 */

export { createNextAuthHandler } from './handler.js'
export type { NextAuthHandlerOptions } from './handler.js'
export { createServerHelpers } from './server.js'
export type { NextAuthServerHelpers } from './server.js'

// Re-export AuthError so users can `instanceof`-check in their own handlers
// without a separate import from @authcore/core.
export { AuthError } from '@authcore/core'
