---
description: "Restrict routes to admins with AuthCore role-based access control in Express, Fastify, NestJS and Next.js."
---

# Role-based access control (admin-only routes)

Every AuthCore user has a `role` (default `'user'`, set with `rbac.defaultRole`). The role is inside the JWT, so checks need no database query.

## Express

```ts
app.get('/admin', auth.middleware(), auth.requireRole('admin'), handler)
```

## Fastify

```ts
app.get('/admin', { preHandler: [auth.authRequired(), auth.requireRole('admin')] }, handler)
```

## NestJS

```ts
@Controller('admin')
@UseGuards(AuthGuard, RolesGuard)
@Roles('admin')
export class AdminController {}
```

## Next.js

```ts
const user = await requireUser()
if (user.role !== 'admin') redirect('/')
```

## Assigning roles

- New users get `rbac.defaultRole`.
- [Invitations](/configuration) can carry a role: `POST /auth/invite` with `{ "email": "...", "role": "editor" }`.
- To promote a user, update the `role` column through your database layer. The new role appears in the next JWT (after refresh or re-login); revoke refresh tokens with `auth.revokeAll(userId)` if the change must take effect immediately.

## Remember

Client-side role checks (`useRole`, `useHasRole` in `@authcore/react`) only hide UI. Enforce authorization on the server.
