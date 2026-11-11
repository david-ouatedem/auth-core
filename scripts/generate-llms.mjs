#!/usr/bin/env node
// Generates docs/public/llms.txt (index) and docs/public/llms-full.txt (all docs concatenated)
// following the llms.txt convention (https://llmstxt.org). Run via `pnpm docs:llms`;
// it also runs automatically before `pnpm docs:build`.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const docs = path.join(root, 'docs')
const out = path.join(docs, 'public')
const SITE = 'https://david-ouatedem.github.io/auth-core'

// Ordered sections; anything not listed is appended under "Other".
const sections = [
  ['Start here', ['getting-started.md', 'configuration.md', 'ai-assistants.md', 'compare.md']],
  ['Recipes', ['recipes/express-email-verification-password-reset.md', 'recipes/nextjs-drizzle-auth.md', 'recipes/rbac-admin-routes.md']],
  ['Framework integrations', ['integrations/nextjs.md', 'integrations/express.md', 'integrations/fastify.md', 'integrations/nestjs.md', 'integrations/react.md']],
  ['Adapters', ['adapters/prisma.md', 'adapters/drizzle.md', 'adapters/resend.md', 'adapters/nodemailer.md']],
  ['Security and features', ['security/threat-model.md', 'security/refresh-tokens.md', 'security/csrf.md', 'security/oauth.md', 'security/magic-link.md', 'security/two-factor.md', 'security/email-templates.md']],
  ['Examples', ['examples/nextjs.md', 'examples/api-only.md', 'examples/monorepo.md', 'examples/frontend-only.md']],
]

function walk(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name)
    if (e.isDirectory()) return ['node_modules', '.vitepress', 'public'].includes(e.name) ? [] : walk(p)
    return e.name.endsWith('.md') && e.name !== 'index.md' ? [path.relative(docs, p)] : []
  })
}

const all = walk(docs).sort()
const listed = new Set(sections.flatMap(([, f]) => f))
const other = all.filter((f) => !listed.has(f))
if (other.length) sections.push(['Other', other])

const missing = [...listed].filter((f) => !all.includes(f))
if (missing.length) throw new Error(`generate-llms: listed docs not found: ${missing.join(', ')}`)

function read(rel) {
  const raw = fs.readFileSync(path.join(docs, rel), 'utf8')
  const fm = raw.match(/^---\n([\s\S]*?)\n---\n/)
  const description = fm?.[1].match(/^description:\s*(.+)$/m)?.[1].trim().replace(/^"(.*)"$/, '$1') ?? ''
  const body = fm ? raw.slice(fm[0].length) : raw
  const title = body.match(/^#\s+(.+)$/m)?.[1].trim() ?? rel
  return { rel, title, description, body: body.trim() }
}
const url = (rel) => `${SITE}/${rel.replace(/\.md$/, '')}`

let index = `# AuthCore

> Self-hosted, security-first authentication for Node.js: register/login, JWT with rotating refresh tokens, email verification, password reset, invitations, magic links, OAuth and TOTP 2FA. One framework-agnostic core with adapters for Express, Fastify, NestJS and Next.js, a React SDK, and Prisma/Drizzle database adapters. MIT licensed.

Key facts for agents: install a framework adapter (e.g. @authcore/express) plus a database adapter (@authcore/prisma-adapter or @authcore/drizzle-adapter); mount the provided router/handler instead of writing auth routes; read AUTH_SECRET (>=32 chars) from the environment. Scaffold a working app with \`npx create-authcore-app\`. Every package ships an AGENTS.md with canonical usage.

Full documentation in one file: ${SITE}/llms-full.txt
`
let full = `# AuthCore: full documentation\n\nSource: ${SITE}/ (generated from docs/ by scripts/generate-llms.mjs)\n`

for (const [name, files] of sections) {
  index += `\n## ${name}\n\n`
  for (const rel of files) {
    const d = read(rel)
    index += `- [${d.title}](${url(rel)})${d.description ? `: ${d.description}` : ''}\n`
    full += `\n\n---\n\n<!-- ${url(rel)} -->\n\n${d.body}\n`
  }
}

fs.mkdirSync(out, { recursive: true })
fs.writeFileSync(path.join(out, 'llms.txt'), index)
fs.writeFileSync(path.join(out, 'llms-full.txt'), full)
fs.writeFileSync(path.join(out, 'robots.txt'), `User-agent: *\nAllow: /\n\nSitemap: ${SITE}/sitemap.xml\n`)
console.log(`llms.txt (${index.length} B), llms-full.txt (${full.length} B), robots.txt written to docs/public`)
