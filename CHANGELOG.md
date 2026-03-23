# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.5.4] - 2026-03-20

### Added

- **@authcore/nestjs**: NestJS adapter with `AuthModule.register()`, guards (`AuthGuard`, `AuthOptionalGuard`, `RolesGuard`), and decorators (`@CurrentUser`, `@Roles`, `@Public`)
- **RBAC**: Role-based access control across all packages. Every user gets a `role` field (default `'user'`), included in the JWT payload.
- **Invitation system**: `invite()` and `acceptInvitation()` methods. Authenticated users can invite new users by email with a pre-assigned role.
- `requireRole()` middleware for Express and Fastify
- `useRole()` and `useHasRole()` hooks for React
- Integration tests for NestJS adapter

### Fixed

- Integration test dotenv path resolution (now resolves from workspace root)
- Vitest `fileParallelism: false` to prevent DB conflicts between test files

## [0.5.3] - 2026-03-15

### Added

- **@authcore/fastify**: Fastify plugin with `authRequired()` and `authOptional()` hooks
- **@authcore/react**: React SDK with `AuthProvider`, `useAuth`, and `ProtectedRoute`
- **create-authcore-app**: CLI scaffolding tool with API-only, frontend-only, and monorepo templates
- VitePress documentation site

## [0.5.0] - 2026-03-10

### Added

- **@authcore/core**: Framework-agnostic auth logic with registration, login, logout, email verification, and password reset
- **@authcore/prisma-adapter**: Prisma database adapter
- **@authcore/express**: Express router and middleware
- **@authcore/resend-adapter**: Resend email adapter
- **@authcore/nodemailer-adapter**: Nodemailer email adapter
