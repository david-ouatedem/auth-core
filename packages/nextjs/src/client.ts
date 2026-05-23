'use client'

/**
 * Client-side exports for Next.js apps.
 *
 * These are the same as `@authcore/react` — re-exported here for one-package
 * convenience and to add the `'use client'` directive so the file is
 * automatically tagged as a Client Component boundary when imported from a
 * Server Component.
 *
 * ```tsx
 * // app/providers.tsx
 * 'use client'
 * import { AuthProvider } from '@authcore/nextjs/client'
 * export function Providers({ children }: { children: React.ReactNode }) {
 *   return (
 *     <AuthProvider baseUrl="" mode="cookie">
 *       {children}
 *     </AuthProvider>
 *   )
 * }
 * ```
 *
 * Then in `app/layout.tsx`:
 *
 * ```tsx
 * import { Providers } from './providers'
 * export default function RootLayout({ children }: { children: React.ReactNode }) {
 *   return <html><body><Providers>{children}</Providers></body></html>
 * }
 * ```
 */
export {
  AuthProvider,
  useAuth,
  useRole,
  useHasRole,
  ProtectedRoute,
} from '@authcore/react'

export type {
  AuthContextValue,
  AuthProviderProps,
} from '@authcore/react'
