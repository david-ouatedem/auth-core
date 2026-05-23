# Memory Index

- [Project state overview](project_state_overview.md) — 11-package monorepo layout, build order, integration test conventions
- [v0.10 features](project_v010_features.md) — Refresh tokens + revocation, CSRF (opt-in), customizable email templates, new callbacks; the DatabaseAdapter.deleteTokensByUserAndType breaking change
- [v0.9 security fix](project_v09_security_fix.md) — AUTH_SECRET reset-email leak (0.5.0–0.8.x affected); cookieName threading; NestJS 401 + cookie support; rotation guidance
- [Docs sweeps must be exhaustive](feedback_docs_exhaustive.md) — for any "fix everything" pass, enumerate every .md file including memory; don't curate to obviously-affected docs
- [Docs site deployment](project_docs_deployment.md) — Live at github.io/auth-core; custom domain steps documented for when authcore.dev is ready
