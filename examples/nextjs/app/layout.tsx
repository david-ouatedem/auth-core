import './globals.css'
import { Providers } from './providers'

export const metadata = {
  title: 'AuthCore Example',
  description: 'Demonstration app for @authcore/nextjs — email/password, magic-link, OAuth, 2FA',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  )
}
