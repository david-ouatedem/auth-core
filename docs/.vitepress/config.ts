import { defineConfig } from 'vitepress'

export default defineConfig({
  title: 'AuthCore',
  description: 'Self-hosted, security-first authentication for Node.js: JWT + refresh tokens, email verification, password reset, OAuth, 2FA. One core for Express, Fastify, NestJS and Next.js.',
  base: '/auth-core/',
  cleanUrls: true,
  lastUpdated: true,
  sitemap: { hostname: 'https://david-ouatedem.github.io/auth-core/' },
  head: [
    ['meta', { property: 'og:type', content: 'website' }],
    ['meta', { property: 'og:title', content: 'AuthCore: self-hosted authentication for Node.js' }],
    ['meta', { property: 'og:description', content: 'Register/login, refresh tokens, email verification, password reset, OAuth and 2FA with a published threat model. Express, Fastify, NestJS, Next.js.' }],
    ['meta', { name: 'twitter:card', content: 'summary' }],
    ['link', { rel: 'alternate', type: 'text/plain', href: '/auth-core/llms.txt', title: 'LLM-friendly docs' }],
  ],
  themeConfig: {
    nav: [
      { text: 'Guide', link: '/getting-started' },
      { text: 'Recipes', link: '/recipes/express-email-verification-password-reset' },
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
          { text: 'AuthCore vs. alternatives', link: '/compare' },
          { text: 'Using AI assistants', link: '/ai-assistants' },
        ],
      },
      {
        text: 'Recipes',
        items: [
          { text: 'Express: verify + reset', link: '/recipes/express-email-verification-password-reset' },
          { text: 'Next.js + Drizzle', link: '/recipes/nextjs-drizzle-auth' },
          { text: 'Admin-only routes (RBAC)', link: '/recipes/rbac-admin-routes' },
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
          { text: 'Threat Model', link: '/security/threat-model' },
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
          { text: 'Next.js (full demo)', link: '/examples/nextjs' },
          { text: 'API-Only', link: '/examples/api-only' },
          { text: 'Monorepo', link: '/examples/monorepo' },
          { text: 'Frontend-Only', link: '/examples/frontend-only' },
        ],
      },
      {
        text: 'Upgrading',
        items: [
          { text: '0.x → 1.0', link: '/migration/0.x-to-1.0' },
        ],
      },
    ],
    socialLinks: [
      { icon: 'github', link: 'https://github.com/david-ouatedem/auth-core' },
    ],
  },
})
