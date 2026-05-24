# @authcore/drizzle-adapter

## 0.12.0

### Minor Changes

- 6b7cc5f: Add **`@authcore/drizzle-adapter`** — Drizzle ORM database adapter. Postgres + SQLite, with the same `DatabaseAdapter` contract as `@authcore/prisma-adapter`.

  ```ts
  // Postgres
  import { drizzle } from "drizzle-orm/node-postgres";
  import { drizzleAdapter } from "@authcore/drizzle-adapter/pg";

  const auth = createAuth({
    db: drizzleAdapter(drizzle(pool)),
    // …
  });
  ```

  ```ts
  // SQLite
  import { drizzle } from "drizzle-orm/better-sqlite3";
  import { drizzleAdapter } from "@authcore/drizzle-adapter/sqlite";

  const auth = createAuth({
    db: drizzleAdapter(drizzle(sqlite)),
    // …
  });
  ```

  Two subpath entries (`/pg`, `/sqlite`) export pre-built table definitions you re-export from your own `db/schema.ts` so `drizzle-kit generate` picks them up. Users can also redefine the tables locally to add extra columns and pass the bundle to `drizzleAdapter(db, schema)`.

  Peer dep: `drizzle-orm` `>=0.30.0 <0.40.0`. The dialect driver (`pg` or `better-sqlite3`) is your own dep — install whichever one you need.

  A side-by-side adapter comparison and schema-extension guide live at `docs/adapters/drizzle.md`.

### Patch Changes

- Updated dependencies [4e9f453]
- Updated dependencies [7dc6db9]
- Updated dependencies [6b7cc5f]
- Updated dependencies [b860a7d]
- Updated dependencies [e6e1197]
- Updated dependencies [227b32b]
- Updated dependencies [347461a]
- Updated dependencies [1b5dec2]
  - @authcore/types@0.12.0
  - @authcore/core@0.12.0
