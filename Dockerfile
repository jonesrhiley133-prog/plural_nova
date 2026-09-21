# syntax=docker/dockerfile:1

# PluralNova, as one container.
#
# Built in two stages so the image that runs is not the image that compiled:
# better-sqlite3 is a native module and needs a C++ toolchain to build, which
# has no business being in something exposed to a network. The compiled module
# is carried across rather than rebuilt, which is why both stages share a base.

FROM node:22-bookworm-slim AS build

# better-sqlite3 compiles from source when no prebuilt binary matches.
RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 make g++ ca-certificates \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Dependencies first, so a change to the source does not reinstall them.
COPY package.json package-lock.json ./
COPY packages/shared/package.json packages/shared/
COPY packages/server/package.json packages/server/
COPY packages/web/package.json packages/web/
RUN npm ci --no-audit --no-fund

COPY tsconfig.base.json ./
COPY packages/ packages/
RUN npm run build

# Drop everything only needed to build, keeping the native module already
# compiled against this exact Node.
RUN npm prune --omit=dev


FROM node:22-bookworm-slim AS runtime

ENV NODE_ENV=production \
    PLURALNOVA_DATA_DIR=/data \
    PORT=4000 \
    HOST=0.0.0.0

WORKDIR /app

COPY --from=build /app/node_modules node_modules/
COPY --from=build /app/package.json ./
COPY --from=build /app/packages/shared/package.json packages/shared/
COPY --from=build /app/packages/shared/dist packages/shared/dist/
COPY --from=build /app/packages/server/package.json packages/server/
COPY --from=build /app/packages/server/dist packages/server/dist/
COPY --from=build /app/packages/web/dist packages/web/dist/

# The database, uploads, push keys and any published APK live here. Without a
# volume mounted on it, they last exactly as long as the container does.
RUN mkdir -p /data && chown -R node:node /data /app
VOLUME ["/data"]

USER node
EXPOSE 4000

# Uses the app's own health endpoint, so an unhealthy container means the API
# is actually not answering rather than that the process merely exists.
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||4000)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "packages/server/dist/index.js"]
