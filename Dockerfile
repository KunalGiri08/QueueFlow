# syntax=docker/dockerfile:1

# -----------------------------------------------------------------------------
# Base Image: Node.js 24 LTS (Krypton) on Alpine Linux
# Node.js 24 LTS matches the host runtime (v24.20.0) and node:lts-alpine,
# providing full compatibility with Next.js 16 and Prisma 7.
# Alpine minimizes container footprint and attack surface.
# -----------------------------------------------------------------------------
FROM node:24-alpine AS base
RUN apk add --no-cache libc6-compat
WORKDIR /app

# -----------------------------------------------------------------------------
# Stage 1: Dependency Installation & Clean Prisma Client Generation
# -----------------------------------------------------------------------------
FROM base AS deps
WORKDIR /app

# Install dependencies based on exact lockfile
COPY package.json package-lock.json ./
COPY prisma ./prisma
COPY prisma7.config.ts ./

# npm ci triggers package.json "postinstall" script:
# "prisma generate --config prisma7.config.ts"
RUN npm ci

# Explicitly ensure clean client generation succeeded in app/generated/prisma
RUN npx prisma generate --config prisma7.config.ts

# -----------------------------------------------------------------------------
# Stage 2: Next.js Production Build
# -----------------------------------------------------------------------------
FROM base AS builder
WORKDIR /app

# Copy dependencies and fresh Prisma Client from deps stage
COPY --from=deps /app/node_modules ./node_modules
COPY . .
COPY --from=deps /app/app/generated/prisma ./app/generated/prisma

# Build arguments:
# NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY is public and baked into client JavaScript by Next.js at build time.
# It must be supplied explicitly; silent fallback to dummy keys is strictly disallowed.
ARG NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY
ENV NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=$NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY

RUN test -n "$NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY" || ( \
    echo "ERROR: NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY build argument is required and cannot be empty." && \
    echo "Supply it explicitly via --build-arg NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_... or Docker Compose." && \
    exit 1 \
)

# Safe dummy placeholders for server-only environment variables required by Next.js
# build-time environment validation in next.config.ts. Real production secrets must
# NEVER be provided during image build or baked into image layers.
ENV DATABASE_URL="postgresql://build-placeholder:build-placeholder@localhost:5432/build_placeholder"
ENV CLERK_SECRET_KEY="sk_test_build_placeholder_secret_key"
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

RUN npm run build

# -----------------------------------------------------------------------------
# Stage 3: Minimal Production Runner
# -----------------------------------------------------------------------------
FROM node:24-alpine AS runner
RUN apk add --no-cache libc6-compat wget
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

# Create unprivileged runtime system user and group
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs

# Copy static assets and public directory
COPY --from=builder /app/public ./public

# Prepare Next.js cache directory with appropriate user permissions
RUN mkdir .next && chown nextjs:nodejs .next

# Copy Next.js standalone server and static assets
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs

EXPOSE 3000

# Container liveness check using application's /api/health?probe=live endpoint
HEALTHCHECK --interval=15s --timeout=3s --start-period=10s --retries=3 \
  CMD wget -qO- http://127.0.0.1:3000/api/health?probe=live > /dev/null || exit 1

CMD ["node", "server.js"]
