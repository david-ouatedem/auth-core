'use client'
import { useRouter } from 'next/navigation'
import { useAuth } from '@authcore/nextjs/client'

export function LogoutButton() {
  const router = useRouter()
  const { signOut } = useAuth()
  return (
    <button
      onClick={async () => {
        await signOut()
        router.push('/')
      }}
    >
      Sign out
    </button>
  )
}
