# syntax=docker/dockerfile:1

# Build stage — glibc image, because esbuild ships a glibc-linked prebuilt binary
FROM node:22-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json .npmrc ./
RUN npm ci --no-audit --no-fund
COPY tsconfig.json ./
COPY bin/build-server.mjs ./bin/
COPY src ./src
RUN npm run server:build && test -s server.mjs

# Runtime stage — the bundle has no native deps, so a pure-JS alpine image works
FROM node:22-alpine
WORKDIR /data
ENV NODE_ENV=production \
	CONFIG_FILE=/data/server.config.json

COPY --from=build /app/server.mjs /app/server.mjs
COPY scripts/container-healthcheck.mjs /app/healthcheck.mjs

# Host uid/gid that owns the bind-mounted config + state dir. Container runs as
# this numeric uid so `--userns=keep-id` (podman) keeps the bind mount writable.
# Override with --build-arg when the host user is not 1000:100.
ARG APP_UID=1000
ARG APP_GID=100
RUN mkdir -p /data && chown "${APP_UID}:${APP_GID}" /data
USER ${APP_UID}:${APP_GID}

# No ports: the notifier only makes outbound HTTPS calls to FatShark and Discord.
# Liveness = seen.json advancing; the healthcheck reads /proc/1 for a start grace.
HEALTHCHECK --interval=60s --timeout=15s --start-period=180s --retries=3 \
	CMD ["node", "/app/healthcheck.mjs"]

ENTRYPOINT ["node", "/app/server.mjs"]
