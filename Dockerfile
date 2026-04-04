FROM node:22-alpine AS base

# ---- Dependencies ----
FROM base AS deps
RUN apk add --no-cache libc6-compat
WORKDIR /app

COPY package.json package-lock.json* pnpm-lock.yaml* yarn.lock* ./
RUN \
  if [ -f pnpm-lock.yaml ]; then \
    corepack enable pnpm && pnpm install --frozen-lockfile; \
  elif [ -f yarn.lock ]; then \
    yarn install --frozen-lockfile; \
  elif [ -f package-lock.json ]; then \
    npm ci; \
  else \
    npm install; \
  fi

# ---- Builder ----
FROM base AS builder
WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY . .

ENV NEXT_TELEMETRY_DISABLED=1

# Build-time env vars (needed for Next.js static optimization)
ARG NEXT_PUBLIC_SUPABASE_URL
ARG NEXT_PUBLIC_SUPABASE_ANON_KEY
ARG SUPABASE_SERVICE_ROLE_KEY
ARG NEXT_PUBLIC_APP_URL
ARG RESEND_API_KEY
ARG RESEND_FROM
ENV NEXT_PUBLIC_SUPABASE_URL=$NEXT_PUBLIC_SUPABASE_URL
ENV NEXT_PUBLIC_SUPABASE_ANON_KEY=$NEXT_PUBLIC_SUPABASE_ANON_KEY
ENV SUPABASE_SERVICE_ROLE_KEY=$SUPABASE_SERVICE_ROLE_KEY
ENV NEXT_PUBLIC_APP_URL=$NEXT_PUBLIC_APP_URL
ENV RESEND_API_KEY=$RESEND_API_KEY
ENV RESEND_FROM=$RESEND_FROM
RUN \
  if [ -f pnpm-lock.yaml ]; then \
    corepack enable pnpm && pnpm run build; \
  elif [ -f yarn.lock ]; then \
    yarn build; \
  else \
    npm run build; \
  fi

# ---- Runner ----
FROM base AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

COPY --from=builder /app/public ./public

# Set correct permissions for prerender cache
RUN mkdir .next
RUN chown nextjs:nodejs .next

# Standalone output — includes minimal node_modules
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder --chown=nextjs:nodejs /app/CHANGELOG.md ./CHANGELOG.md

# Force-install resend + deps (standalone trace has incomplete pnpm artifacts)
RUN mkdir -p /tmp/resend-pkg && cd /tmp/resend-pkg && \
    npm init -y > /dev/null 2>&1 && \
    npm install --no-save resend@6 > /dev/null 2>&1 && \
    for pkg in /tmp/resend-pkg/node_modules/*; do \
      name=$(basename "$pkg"); \
      rm -rf "/app/node_modules/$name" 2>/dev/null; \
      cp -r "$pkg" "/app/node_modules/$name"; \
    done && \
    rm -rf /tmp/resend-pkg

USER nextjs

EXPOSE 3000

ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

CMD ["node", "server.js"]

# ---- Background Workers ----
FROM base AS worker-base
WORKDIR /app

ENV NODE_ENV=production

COPY --from=deps /app/node_modules ./node_modules
COPY package.json ./
COPY scripts ./scripts
COPY src/lib ./src/lib
COPY src/app/api/v1/projects/_helpers.ts ./src/app/api/v1/projects/_helpers.ts

# ---- Webhook Retry Worker ----
FROM worker-base AS worker
CMD ["node", "--import", "tsx", "scripts/webhook-retry-worker.ts"]

# ---- Project Invitation Sweep Worker ----
FROM worker-base AS invitation-worker
CMD ["node", "--import", "tsx", "scripts/project-invitation-sweep.ts"]
