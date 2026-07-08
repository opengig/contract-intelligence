# next-nest-casl-monorepo

A full-stack monorepo template using Next.js and NestJS, managed with Turborepo and pnpm workspaces.

## Stack

| Layer        | Technology                                       |
| ------------ | ------------------------------------------------ |
| Frontend     | Next.js 16, React 19, Tailwind CSS v4, shadcn/ui |
| Backend      | NestJS 10, Prisma 7 (SQL Server)                 |
| Auth         | CASL (ability-based authorization)               |
| Monorepo     | Turborepo, pnpm workspaces                       |
| Language     | TypeScript (strict, shared config)               |
| Testing      | Jest, ts-jest                                    |
| Code quality | ESLint, Prettier, Lefthook (pre-commit)          |

## Structure

```
apps/
  web/          Next.js frontend
  server/       NestJS backend

packages/
  db/           Prisma client + SQL Server adapter (@repo/db)
  auth/         CASL ability definitions (@repo/auth)
  types/        Shared TypeScript interfaces (@repo/types)
  eslint-config/     Shared ESLint config
  typescript-config/ Shared tsconfig presets
```

## Getting started

```bash
pnpm install
pnpm dev          # starts all apps in parallel
```

> This project requires pnpm >=9. `COREPACK_ENABLE_STRICT=0` is set in `.npmrc` so corepack will not block developers on a different pnpm minor/patch version.

## Common commands

```bash
pnpm build        # build all packages and apps
pnpm lint         # lint all workspaces
pnpm test         # run all unit tests
pnpm format       # format all files with Prettier
```

## Test coverage

Run coverage for the NestJS backend from the repo root:

```bash
pnpm --filter server test:cov
```

Or from `apps/server` directly:

```bash
pnpm test:cov
```

This produces:

- A **terminal summary table** — statements, branches, functions, and lines per file.
- An **HTML report** at `apps/server/coverage/lcov-report/index.html` — open in a browser for line-level highlighting.

Coverage is collected from all files under `apps/server/src/`.

## Authorization

Authorization uses [CASL](https://casl.js.org) with an ability-based model. The core logic lives in `packages/auth` and is shared across apps via `@repo/auth`.

**Roles**

| Role    | Permissions               |
| ------- | ------------------------- |
| `admin` | manage all subjects       |
| `user`  | read all, update own User |

**Subjects:** `User`, `Post`, `all`  
**Actions:** `create`, `read`, `update`, `delete`, `manage`

**Backend usage**

Routes are protected with `CaslGuard` + `@CheckAbility`:

```typescript
@Get()
@UseGuards(CaslGuard)
@CheckAbility('read', 'User')
findAll() { ... }
```

**Adding permissions**

Edit `packages/auth/src/permissions.ts` — the `defineAbilityFor` function is the single source of truth for all role/subject/action rules. Do not add permission logic inside individual apps.

## Shared types

Payload and domain types shared between the frontend and backend are defined once in `packages/types` and imported via `@repo/types`:

```typescript
import type { User, CreateUserPayload } from "@repo/types";
```

Add new shared types to `packages/types/src/` and export them from `packages/types/src/index.ts`. Do not duplicate shared contracts as local types inside an app.

## Domain-driven design

Bounded contexts communicate through domain events rather than direct imports, using NestJS `EventEmitter2`. A module emits an event after a state change; other modules listen and react independently, keeping contexts fully decoupled.

```
users/events/user-created.event.ts          ← event definition, owned by Users context
notifications/events/notifications.listener.ts ← reaction, owned by Notifications context
```

## Backend conventions

- **Repository pattern** — data access is isolated in `*.repository.ts` classes; services contain only business logic.
- **Path alias** — `@/` maps to `apps/server/src/`.
- **Global exception filter** — `AllExceptionsFilter` handles all unhandled exceptions globally; no try/catch needed in controllers or services.
- **Unit tests** — specs live in `apps/server/test/<module>/`, not alongside source files.
- **TDD** — tests are written before implementation; mocks are applied only at true boundaries (repository, external APIs).

## Pre-commit hooks

Lefthook runs three checks in parallel on every commit:

- **lint** — ESLint across all workspaces (via turbo)
- **format** — Prettier on staged files, re-staged automatically
- **test** — full unit test suite (via turbo, with caching)

## Database

SQL Server via Prisma. Configure connection in `apps/server/.env`:

```env
DB_HOST=localhost
DB_PORT=1433
DB_NAME=mydb
DB_USER=sa
DB_PASSWORD=yourpassword
DB_ENCRYPT=true
DB_TRUST_SERVER_CERT=true
```
