import { defineConfig } from 'vitepress'

export default defineConfig({
  title: 'AuthCore',
  description: 'A Devise-inspired, framework-agnostic authentication library for the JS ecosystem',
  base: '/auth-core/',
  themeConfig: {
    nav: [
      { text: 'Guide', link: '/getting-started' },
      { text: 'Adapters', link: '/adapters/prisma' },
      { text: 'Integrations', link: '/integrations/express' },
      { text: 'Security', link: '/security/refresh-tokens' },
      { text: 'Examples', link: '/examples/api-only' },
    ],
    sidebar: [
      {
        text: 'Guide',
        items: [
          { text: 'Getting Started', link: '/getting-started' },
          { text: 'Configuration', link: '/configuration' },
        ],
      },
      {
        text: 'Adapters',
        items: [
          { text: 'Prisma', link: '/adapters/prisma' },
          { text: 'Drizzle', link: '/adapters/drizzle' },
          { text: 'Resend', link: '/adapters/resend' },
          { text: 'Nodemailer', link: '/adapters/nodemailer' },
        ],
      },
      {
        text: 'Integrations',
        items: [
          { text: 'Next.js', link: '/integrations/nextjs' },
          { text: 'Express', link: '/integrations/express' },
          { text: 'Fastify', link: '/integrations/fastify' },
          { text: 'NestJS', link: '/integrations/nestjs' },
          { text: 'React', link: '/integrations/react' },
        ],
      },
      {
        text: 'Security',
        items: [
          { text: 'Refresh Tokens', link: '/security/refresh-tokens' },
          { text: 'CSRF', link: '/security/csrf' },
          { text: 'OAuth', link: '/security/oauth' },
          { text: 'Magic-Link Login', link: '/security/magic-link' },
          { text: 'Two-Factor (TOTP)', link: '/security/two-factor' },
          { text: 'Email Templates', link: '/security/email-templates' },
        ],
      },
      {
        text: 'Examples',
        items: [
          { text: 'API-Only', link: '/examples/api-only' },
          { text: 'Monorepo', link: '/examples/monorepo' },
          { text: 'Frontend-Only', link: '/examples/frontend-only' },
        ],
      },
    ],
    socialLinks: [
      { icon: 'github', link: 'https://github.com/david-ouatedem/auth-core' },
    ],
  },
})
