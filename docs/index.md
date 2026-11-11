---
layout: home

hero:
  name: AuthCore
  text: Self-hosted authentication for Node.js
  tagline: Registration, login, refresh tokens, email verification, password reset, OAuth and 2FA in one call. Secure defaults, a published threat model, and one core for Express, Fastify, NestJS and Next.js.
  actions:
    - theme: brand
      text: Get Started
      link: /getting-started
    - theme: alt
      text: View on GitHub
      link: https://github.com/david-ouatedem/auth-core

features:
  - title: Batteries included
    details: JWT with rotating refresh tokens, email verification, password reset, invitations, magic links, OAuth (Google, GitHub, Microsoft, Discord, Apple), TOTP 2FA, RBAC and CSRF.
    link: /compare
    linkText: How it compares
  - title: Secure by default
    details: bcrypt (12+ rounds), SHA-256 hashed tokens, timing-safe comparison, no email enumeration, and a written threat model you can audit.
    link: /security/threat-model
    linkText: Read the threat model
  - title: One core, every framework
    details: Express, Fastify, NestJS and Next.js adapters share the same behavior. Prisma or Drizzle for data, Resend or Nodemailer for email.
    link: /recipes/express-email-verification-password-reset
    linkText: Try a recipe
  - title: Built for humans and AI agents
    details: llms.txt, AGENTS.md in every package and in scaffolded projects, and a Claude skill, so coding assistants use it correctly.
    link: /ai-assistants
    linkText: AI assistant guide
---
