# ── Build stage ──────────────────────────────────────────────────────
FROM node:20-slim AS build

WORKDIR /app

# Copy workspace structure
COPY package.json package-lock.json ./
COPY apps/api/package.json ./apps/api/
COPY packages/heb/package.json ./packages/heb/
COPY packages/shared/package.json ./packages/shared/

# Install all dependencies (including dev for building)
RUN npm ci --workspace=apps/api --workspace=packages/heb --workspace=packages/shared --include-workspace-root

# Copy source
COPY apps/api/ ./apps/api/
COPY packages/ ./packages/

# Build packages first (they output to dist/)
RUN npx tsc --project packages/shared/tsconfig.json
RUN npx tsc --project packages/heb/tsconfig.json

# Build the API
RUN npm run build --workspace=apps/api

# Rewrite package.json main fields to point to compiled JS for production
RUN node -e "const fs=require('fs'); \
  for(const pkg of ['packages/heb','packages/shared']){ \
    const p=JSON.parse(fs.readFileSync(pkg+'/package.json','utf8')); \
    p.main='./dist/index.js'; p.types='./dist/index.d.ts'; \
    fs.writeFileSync(pkg+'/package.json',JSON.stringify(p,null,2)); \
  }"

# ── Production stage ─────────────────────────────────────────────────
FROM mcr.microsoft.com/playwright:v1.52.0-noble AS production

WORKDIR /app

# Copy built API
COPY --from=build /app/apps/api/dist ./apps/api/dist
COPY --from=build /app/apps/api/package.json ./apps/api/

# Copy built packages (dist + updated package.json)
COPY --from=build /app/packages/heb/dist ./packages/heb/dist
COPY --from=build /app/packages/heb/package.json ./packages/heb/
COPY --from=build /app/packages/shared/dist ./packages/shared/dist
COPY --from=build /app/packages/shared/package.json ./packages/shared/

# Copy root workspace config
COPY --from=build /app/package.json ./
COPY --from=build /app/package-lock.json ./

# Install production dependencies only
RUN npm ci --workspace=apps/api --workspace=packages/heb --workspace=packages/shared --include-workspace-root --omit=dev

# Playwright browsers are already installed in the base image
ENV PLAYWRIGHT_BROWSERS_PATH=/ms-playwright
ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=3000

EXPOSE 3000

CMD ["node", "apps/api/dist/server.js"]
