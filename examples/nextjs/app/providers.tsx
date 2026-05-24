'use client'
import { AuthProvider } from '@authcore/nextjs/client'

export function Providers({ children }: { children: React.ReactNode }) {
  // baseUrl='' because the API routes are same-origin in a Next.js app.
  return (
    <AuthProvider baseUrl="" mode="cookie">
      {children}
    </AuthProvider>
  )
}
