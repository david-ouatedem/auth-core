# Frontend-Only Example

A standalone React SPA that connects to any AuthCore-compatible API. No backend code included.

[View source on GitHub](https://github.com/david-ouatedem/auth-core/tree/main/examples/frontend-only)

## Architecture

```
examples/frontend-only/
└── Vite + React + @authcore/react mode="api"
```

- Points to a configurable external API URL via `VITE_API_URL`
- Token stored in localStorage
- Works with any AuthCore backend (Express or Fastify)

## Setup

```bash
cd examples/frontend-only
cp .env.example .env
# Set VITE_API_URL to your AuthCore API

pnpm install
pnpm dev
```

## When to Use

- You already have a deployed AuthCore API
- You want to build a frontend against a shared staging API
- You want to test the React SDK without running a local backend
