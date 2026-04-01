# Frontend-Only Example

A standalone React SPA that connects to any auth API — AuthCore-powered or not.

[View source on GitHub](https://github.com/david-ouatedem/auth-core/tree/main/examples/frontend-only)

## Architecture

```
examples/frontend-only/
└── Vite + React + @authcore/react mode="api"
```

- Points to a configurable external API URL via `VITE_API_URL`
- Token stored in localStorage
- Works with any backend via response transformers

## Setup

```bash
cd examples/frontend-only
cp .env.example .env
# Set VITE_API_URL to your API base URL

pnpm install
pnpm dev
```

## When to Use

- You already have a deployed API (AuthCore or custom)
- You want to build a frontend against a shared staging API
- You want to test the React SDK without running a local backend

## Connecting to a Custom Backend

If your backend is not AuthCore-based, use the transformer props to adapt the response shapes. See [Custom Backend Integration](../integrations/react.md#custom-backend-integration) for full examples.
