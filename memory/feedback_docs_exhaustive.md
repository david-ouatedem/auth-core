---
name: feedback-docs-exhaustive
description: When doing a "fix everything" pass on auth-core, the docs sweep must enumerate every README + every doc page + memory; do not stop at the obviously-affected ones
metadata:
  type: feedback
---

When the user asks to fix "everything" on auth-core (or any similarly bug-fix-and-cleanup pass), **the docs sweep must be exhaustive** — every package README, the global README, every VitePress page, community files (CONTRIBUTING/SECURITY/CHANGELOG), and the persistent memory index.

**Why:** in the 0.9 fix pass, I planned an initial docs section that only listed the obviously-affected files (configuration.md, integrations/nestjs.md, CLAUDE.md). The user pushed back: "make sure to update docs (packages readme, global readme, website doc and any other docs) to fit the current state of the project, also update the memory." They expect a complete `find . -name "*.md"` enumeration with each file explicitly called out — not a curated subset based on what I think changed.

**How to apply:**
1. In any plan-phase covering docs on auth-core, **start with `find . -name "*.md"` excluding node_modules/dist** and list every file.
2. For each, state explicitly what changes (even "no change beyond consistency check" counts as a status).
3. Include `memory/MEMORY.md` and the topic memory files as first-class doc deliverables — not afterthoughts.
4. The 38-file list lives in the 0.9 plan at `C:\Users\wilfr\.claude\plans\write-a-plan-for-zippy-haven.md` — reuse that structure as a baseline for future passes.
5. After editing, sweep with grep to confirm no stale references remain: `grep -r "Returns 403" docs/ packages/*/README.md` (should only find RolesGuard hits), `grep -r "'emailVerification', 'passwordReset'\]" docs/ packages/` (should be empty if invitation feature is documented), etc. See the verification section of the plan for the canonical greps.
