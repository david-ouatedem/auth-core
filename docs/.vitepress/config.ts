import { defineConfig } from 'vitepress'

export default defineConfig({
  title: 'AuthCore',
  description: 'A Devise-inspired, framework-agnostic authentication library for the JS ecosystem',
  themeConfig: {
    nav: [
      { text: 'Guide', link: '/getting-started' },
      { text: 'Adapters', link: '/adapters/prisma' },
      { text: 'Integrations', link: '/integrations/express' },
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
          { text: 'Resend', link: '/adapters/resend' },
          { text: 'Nodemailer', link: '/adapters/nodemailer' },
        ],
      },
      {
        text: 'Integrations',
        items: [
          { text: 'Express', link: '/integrations/express' },
          { text: 'Fastify', link: '/integrations/fastify' },
          { text: 'React', link: '/integrations/react' },
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
