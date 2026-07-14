# ─── Stage 1: Production dependencies (native modules compiled for alpine) ────
FROM node:22-alpine AS deps

# Build tools required by better-sqlite3
RUN apk add --no-cache python3 make g++

WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci --omit=dev

# ─── Stage 2: Build the Next.js application ───────────────────────────────────
FROM node:22-alpine AS builder

RUN apk add --no-cache python3 make g++

WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci
COPY . .

ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

# ─── Stage 3: Production runner ───────────────────────────────────────────────
FROM node:22-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

# Create non-root user
RUN addgroup --system --gid 1001 nodejs \
 && adduser  --system --uid 1001 nextjs

# Persistent data directory for SQLite database
RUN mkdir -p /data && chown nextjs:nodejs /data

# Production node_modules (compiled on alpine, same as runner)
COPY --from=deps    --chown=nextjs:nodejs /app/node_modules ./node_modules
# Built Next.js output and app manifest
COPY --from=builder --chown=nextjs:nodejs /app/.next        ./.next
COPY --from=builder --chown=nextjs:nodejs /app/package.json ./package.json

USER nextjs

EXPOSE 3000

# Railway overrides PORT at runtime; Next.js reads it automatically
ENV PORT=3000
ENV HOSTNAME=0.0.0.0
ENV DATABASE_PATH=/data/todos.db

CMD ["node_modules/.bin/next", "start"]


ENV PORT=3000
ENV HOSTNAME=0.0.0.0
# SQLite database stored in the /data volume; override via Railway env var
ENV DATABASE_PATH=/data/todos.db

CMD ["node", "server.js"]
