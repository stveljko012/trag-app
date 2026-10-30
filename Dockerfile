# syntax=docker/dockerfile:1

# The web and api builds are plain JS, so they run on the build machine's own platform (fast even
# when the target is arm64 under emulation). Only the runtime dependencies, which include native
# modules (@node-rs/argon2), are installed for the target platform.

# ---- deps: full install for building ----
FROM --platform=$BUILDPLATFORM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
COPY web/package.json web/
COPY api/package.json api/
RUN npm ci

# ---- build: web -> web/dist, api -> api/dist ----
FROM deps AS build
COPY . .
RUN npm run build -w @trag/web && npm run build -w @trag/api

# ---- prod-deps: api runtime dependencies only ----
FROM node:22-alpine AS prod-deps
WORKDIR /app
COPY package.json package-lock.json ./
COPY web/package.json web/
COPY api/package.json api/
RUN npm ci --omit=dev -w @trag/api && rm -rf node_modules/@trag

# ---- runtime ----
FROM node:22-alpine
ENV NODE_ENV=production
WORKDIR /app
COPY --from=prod-deps /app/node_modules ./node_modules
COPY --from=build /app/api/package.json ./package.json
COPY --from=build /app/api/dist ./dist
COPY --from=build /app/api/drizzle ./drizzle
COPY --from=build /app/web/dist ./public
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s \
  CMD wget -qO- http://127.0.0.1:3000/api/health >/dev/null || exit 1
CMD ["node", "dist/index.js"]
