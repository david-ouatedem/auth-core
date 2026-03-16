# create-authcore-app

> Scaffold a new AuthCore project in seconds.

## Usage

```bash
npx create-authcore-app
```

The CLI will prompt you for:

1. **Project name** - directory to create
2. **Template** - choose your setup:
   - **api-only** - Express backend + React frontend on separate ports (Bearer token auth)
   - **monorepo** - Express + React in one repo (httpOnly cookie auth, Vite proxy)
   - **frontend-only** - React SPA connecting to an existing AuthCore API
3. **Package manager** - pnpm, npm, or yarn

## After Scaffolding

```bash
cd my-authcore-app
cp .env.example .env     # fill in DATABASE_URL and AUTH_SECRET
npm install              # or pnpm/yarn
npx prisma db push       # create database tables
npm run dev              # start dev server
```

## Templates

### api-only

Express API on port 3000, React SPA on port 5173. Auth uses JWT Bearer tokens.

```
my-app/
├── backend/        # Express + Prisma + AuthCore
└── frontend/       # React + @authcore/react
```

### monorepo

Express serves the React app via Vite proxy. Auth uses httpOnly cookies.

```
my-app/
├── server/         # Express + Prisma + AuthCore (cookie mode)
└── client/         # React + @authcore/react (cookie mode)
```

### frontend-only

React SPA that connects to any AuthCore-compatible API.

```
my-app/
└── src/            # React + @authcore/react
```

## License

[MIT](https://github.com/david-ouatedem/auth-core/blob/main/LICENSE)
