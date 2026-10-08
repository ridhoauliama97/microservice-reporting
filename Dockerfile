FROM oven/bun:1.3.14 AS deps
WORKDIR /app
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile --production

# The documentation site is built here rather than in the runtime stage: the
# Mintlify CLI needs Node, and the oven/bun image has none.
#
# `mint export` writes a zip for air-gapped use; it is unpacked and then its
# links are rewritten so the site can be served under /docs instead of at the
# root of a host. See docs/scripts/rewrite-static-paths.mjs.
#
# This stage needs network access to fetch the Mintlify CLI. If that is not
# available, pre-generate the site and add a stage that copies it in instead.
FROM node:22-slim AS docs
RUN apt-get update \
 && apt-get install -y --no-install-recommends unzip ca-certificates \
 && rm -rf /var/lib/apt/lists/*
WORKDIR /build
COPY docs ./docs
RUN cd docs \
 && npx --yes mint@latest export --output /tmp/site.zip \
 && mkdir -p /site \
 && unzip -q /tmp/site.zip -d /site \
 && rm /tmp/site.zip \
 && node scripts/rewrite-static-paths.mjs /site

FROM oven/bun:1.3.14
WORKDIR /app
ENV NODE_ENV=production
COPY --from=deps /app/node_modules ./node_modules
COPY package.json tsconfig.json ./
COPY src ./src
# Served by src/app.ts at /docs and /_next.
COPY --from=docs /site ./docs-site
RUN mkdir -p /app/storage && chown -R bun:bun /app
USER bun
EXPOSE 5007
CMD ["bun", "run", "src/index.ts"]
