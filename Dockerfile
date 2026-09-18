# ── Build stage ──────────────────────────────────────────────────────
FROM node:20-slim AS build

WORKDIR /app

# Copy workspace structure
COPY package.json package-lock.json ./
COPY apps/api/package.json ./apps/api/
COPY packages/shared/package.json ./packages/shared/

# Install all dependencies (including dev for building)
RUN npm ci --workspace=apps/api --workspace=packages/shared --include-workspace-root

# Copy source
COPY apps/api/ ./apps/api/
COPY packages/shared/ ./packages/shared/

# Build shared package (outputs to dist/)
RUN npx tsc --project packages/shared/tsconfig.json

# Build the API
RUN npm run build --workspace=apps/api

# Rewrite package.json main field to point to compiled JS for production
RUN node -e "const fs=require('fs'); \
  const p=JSON.parse(fs.readFileSync('packages/shared/package.json','utf8')); \
  p.main='./dist/index.js'; p.types='./dist/index.d.ts'; \
  fs.writeFileSync('packages/shared/package.json',JSON.stringify(p,null,2));"

# ── Production stage ─────────────────────────────────────────────────
FROM node:20-slim AS production

WORKDIR /app

# Copy built API
COPY --from=build /app/apps/api/dist ./apps/api/dist
COPY --from=build /app/apps/api/package.json ./apps/api/

# Copy built shared package (dist + updated package.json)
COPY --from=build /app/packages/shared/dist ./packages/shared/dist
COPY --from=build /app/packages/shared/package.json ./packages/shared/

# Copy root workspace config
COPY --from=build /app/package.json ./
COPY --from=build /app/package-lock.json ./

# Install production dependencies only
RUN npm ci --workspace=apps/api --workspace=packages/shared --include-workspace-root --omit=dev

ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=3000

EXPOSE 3000

CMD ["node", "apps/api/dist/server.js"]
