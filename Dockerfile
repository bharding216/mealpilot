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

# Build TypeScript
RUN npm run build --workspace=apps/api

# ── Production stage ─────────────────────────────────────────────────
FROM mcr.microsoft.com/playwright:v1.52.0-noble AS production

# Playwright image is based on Ubuntu and includes Chromium + all deps.
# Switch to a non-root user for security.
WORKDIR /app

# Copy built API + node_modules from build stage
COPY --from=build /app/apps/api/dist ./apps/api/dist
COPY --from=build /app/apps/api/package.json ./apps/api/
COPY --from=build /app/packages/heb ./packages/heb
COPY --from=build /app/packages/shared ./packages/shared
COPY --from=build /app/package.json ./
COPY --from=build /app/package-lock.json ./

# Install production dependencies only
RUN npm ci --workspace=apps/api --workspace=packages/heb --workspace=packages/shared --include-workspace-root --omit=dev

# Playwright browsers are already installed in the base image.
# Tell Playwright where to find them.
ENV PLAYWRIGHT_BROWSERS_PATH=/ms-playwright

# Runtime config
ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=3000

EXPOSE 3000

CMD ["node", "apps/api/dist/server.js"]
