# syntax=docker/dockerfile:1

# Production image, built by GitHub Actions (.github/workflows/deploy.yml).
# Holds the Next.js standalone server and tools/ for one-off containers from the same image:
# migrations before every deploy and test data on demand (see deploy/compose.yaml).

FROM node:24-slim AS build
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1

# pnpm version comes from packageManager in package.json
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN npm install --global "pnpm@$(node -p "require('./package.json').packageManager.split('@')[1]")" \
 && pnpm install --frozen-lockfile

COPY . .
# The app checks DATABASE_URL on import, but nothing connects during the build: a placeholder is enough
RUN DATABASE_URL=postgresql://build:build@127.0.0.1:5432/build pnpm build

# The server bundle has its own copy of the database code; the scripts in tools/ run outside it
# and need these packages as real folders (cp -L resolves pnpm symlinks)
RUN mkdir -p /tools/node_modules/@faker-js /tools/node_modules/@next \
 && cp -rL node_modules/drizzle-orm node_modules/postgres /tools/node_modules/ \
 && cp -rL node_modules/@faker-js/faker /tools/node_modules/@faker-js/ \
 && cp -rL node_modules/@next/env /tools/node_modules/@next/

FROM node:24-slim AS runner
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    HOSTNAME=0.0.0.0 \
    PORT=3000

COPY --from=build --chown=node:node /app/.next/standalone ./
COPY --from=build --chown=node:node /app/.next/static ./.next/static

# tools/ mirrors the repo layout, so the scripts' relative imports work unchanged;
# its package.json makes the imported schema.ts load as ES module too
COPY --from=build /tools/node_modules ./tools/node_modules
COPY drizzle ./tools/drizzle
COPY scripts ./tools/scripts
COPY src/db/schema.ts ./tools/src/db/schema.ts
RUN echo '{ "type": "module" }' > tools/package.json

USER node
EXPOSE 3000
CMD ["node", "server.js"]
