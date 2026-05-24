---
"@authcore/react": patch
---

Fix: `<AuthProvider>` now supplies `getServerSnapshot` to `useSyncExternalStore`. Without it, Next.js 15 static prerendering (e.g. of the `/_not-found` page) bails out with "Missing getServerSnapshot" the moment AuthProvider sits above the page in the layout tree. The server snapshot returns the initial unauthenticated state; the client's `refreshUser()` effect populates the real session on hydration.

No API change. App code does not need updating — existing consumers benefit automatically.
