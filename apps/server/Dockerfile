# ── Stage 1: deps ────────────────────────────────────────────────────────────
FROM node:22-alpine AS deps
RUN corepack enable && corepack prepare pnpm@9.0.0 --activate
WORKDIR /app

# Copy workspace manifests only (for layer caching)
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY apps/server/package.json ./apps/server/
COPY packages/auth/package.json ./packages/auth/
COPY packages/db/package.json ./packages/db/
COPY packages/types/package.json ./packages/types/
COPY packages/eslint-config/package.json ./packages/eslint-config/
COPY packages/typescript-config/package.json ./packages/typescript-config/

RUN pnpm install --frozen-lockfile

# ── Stage 2: builder ─────────────────────────────────────────────────────────
FROM deps AS builder
WORKDIR /app

# Copy source
COPY packages/ ./packages/
COPY apps/server/ ./apps/server/

# Generate Prisma client then build
RUN pnpm --filter @repo/db run db:generate
RUN pnpm --filter server run build

# Prune to production deps only
RUN pnpm deploy --filter server --prod /app/deploy

# ── Stage 3: runner ───────────────────────────────────────────────────────────
FROM node:22-alpine AS runner
RUN corepack enable && corepack prepare pnpm@9.0.0 --activate
WORKDIR /app

ENV NODE_ENV=production

# Copy pruned production install + built output
COPY --from=builder /app/deploy ./
COPY --from=builder /app/apps/server/dist ./dist

# Copy schema for any runtime introspection
COPY --from=builder /app/packages/db/prisma ./prisma
# Copy generated Prisma client (custom output path used by @repo/db)
COPY --from=builder /app/packages/db/generated ./packages/db/generated

EXPOSE 8081

CMD ["node", "dist/main"]
