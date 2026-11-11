---
description: "Use AuthCore with Claude Code, Cursor, Copilot and other AI coding assistants: llms.txt, AGENTS.md shipped in every package, a ready-made prompt and a Claude skill."
---

# Using AuthCore with AI coding assistants

AuthCore is built to be easy for coding agents to use correctly, not just humans.

## What we provide

- **[`/llms.txt`](/llms.txt) and [`/llms-full.txt`](/llms-full.txt)**: an index and the full text of these docs in one file. Paste the URL into your assistant, or add it as a documentation source (Cursor: *Docs*, Claude Code: reference it in your prompt).
- **`AGENTS.md` inside the npm packages** (`@authcore/core`, `express`, `fastify`, `nestjs`, `nextjs`, `react`): canonical usage and guardrails. After installing, agents can read `node_modules/@authcore/<package>/AGENTS.md`.
- **`AGENTS.md` in every `create-authcore-app` template**, so a scaffolded project already carries the rules.
- **A Claude Code skill** in the repo at [`skills/authcore`](https://github.com/david-ouatedem/auth-core/tree/main/skills/authcore). Copy it to `.claude/skills/authcore/` in your project.
- **Actionable errors**: for example `MISSING_URL` tells you exactly which argument to pass, so an agent can self-correct.

## A prompt that works

> Add authentication to this app using AuthCore (https://david-ouatedem.github.io/auth-core/llms.txt). Use the adapter for my framework, mount the provided router/handler instead of writing my own routes, read `AUTH_SECRET` from the environment, and enable email verification and password reset with Resend. Read the package's `AGENTS.md` first.

Or skip the prompt: `npx create-authcore-app` generates a working project.

## Guardrails agents should follow

1. Use the framework adapter; do not hand-roll login/register/reset routes.
2. Never hardcode or log `AUTH_SECRET`.
3. Use the shipped database schema.
4. Email features need an email adapter.
5. Keep security defaults (bcrypt rounds, always-200 forgot-password, hashed tokens).

The full list is in each package's `AGENTS.md`.
