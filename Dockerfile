# syntax=docker/dockerfile:1
# Multi-stage production image for WheelCore Intelligence Terminal.

# ---- deps: full install (reproducible via package-lock.json) ----
FROM node:22-alpine AS deps
RUN apk add --no-cache libc6-compat
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

# ---- builder ----
FROM node:22-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
# NEXT_PUBLIC_* values are inlined into the client bundle at build time.
ARG NEXT_PUBLIC_ENABLE_SAMPLE_ETF_SCREENS=false
ENV NEXT_PUBLIC_ENABLE_SAMPLE_ETF_SCREENS=${NEXT_PUBLIC_ENABLE_SAMPLE_ETF_SCREENS}
# No database is contacted at build time (all pages are force-dynamic); db/index.ts tolerates the build phase.
RUN npm run build

# ---- migrator: tiny prod-only dependency set for running SQL migrations at start ----
FROM node:22-alpine AS migrator
WORKDIR /migrate
COPY package.json package-lock.json /tmp/src/
RUN node -e "const p=require('/tmp/src/package.json');require('fs').writeFileSync('package.json',JSON.stringify({name:'migrate',private:true,type:'module',dependencies:{'drizzle-orm':p.dependencies['drizzle-orm'],pg:p.dependencies.pg}}))" \
 && npm install --omit=dev --no-audit --no-fund
COPY scripts/migrate.mjs ./migrate.mjs
COPY drizzle ./drizzle

# ---- runner ----
FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0 \
    MIGRATIONS_DIR=/migrate/drizzle

RUN addgroup --system --gid 1001 nodejs && adduser --system --uid 1001 nextjs

COPY --from=builder --chown=nextjs:nodejs /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=migrator --chown=nextjs:nodejs /migrate /migrate
COPY --chown=nextjs:nodejs docker-entrypoint.sh /app/docker-entrypoint.sh

USER nextjs
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+process.env.PORT+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["/app/docker-entrypoint.sh"]
