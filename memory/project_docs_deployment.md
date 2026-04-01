---
name: Docs site deployment
description: AuthCore docs site is deployed to GitHub Pages; custom domain steps for when authcore.dev is acquired
type: project
---

Docs site is live at https://david-ouatedem.github.io/auth-core/ via GitHub Actions (`.github/workflows/docs.yml`), triggered on push to `main`.

**Why:** VitePress site existed but had never been deployed. Set up as part of v0.7.0 work.

**How to apply:** When a custom domain is acquired, three changes needed:
1. Create `docs/public/CNAME` with the domain name
2. Remove `base: '/auth-core/'` from `docs/.vitepress/config.ts`
3. Point DNS to GitHub Pages IPs and enable custom domain in repo Settings → Pages
