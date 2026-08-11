# Builds apps/web for Cloud Run. Build context must be the repo root (so
# workspace packages are visible), e.g. `docker build -f Dockerfile .`.
# See CLOUD_RUN_DEPLOY.md for the full deploy flow, including how secrets
# from Secret Manager reach the running container.

FROM node:20-slim AS deps
WORKDIR /repo
COPY package.json package-lock.json ./
COPY apps/web/package.json apps/web/package.json
COPY packages/core/package.json packages/core/package.json
COPY packages/db/package.json packages/db/package.json
COPY packages/shared-types/package.json packages/shared-types/package.json
COPY packages/importer/package.json packages/importer/package.json
RUN npm ci

FROM node:20-slim AS build
WORKDIR /repo
COPY --from=deps /repo/node_modules ./node_modules
COPY . .

# NEXT_PUBLIC_* vars are inlined into the client bundle at build time, so
# they must arrive as build args, not runtime env/secrets (Cloud Run's
# --set-secrets/--set-env-vars run too late to affect this build).
ARG NEXT_PUBLIC_GOOGLE_MAPS_API_KEY
ARG NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID
ARG NEXT_PUBLIC_FIREBASE_API_KEY
ARG NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN
ARG NEXT_PUBLIC_FIREBASE_PROJECT_ID
ARG NEXT_PUBLIC_FIREBASE_APP_ID
ARG CONTACT_FORWARD_EMAIL
ARG EMAIL_FROM
ENV NEXT_PUBLIC_GOOGLE_MAPS_API_KEY=$NEXT_PUBLIC_GOOGLE_MAPS_API_KEY \
    NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID=$NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID \
    NEXT_PUBLIC_FIREBASE_API_KEY=$NEXT_PUBLIC_FIREBASE_API_KEY \
    NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=$NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN \
    NEXT_PUBLIC_FIREBASE_PROJECT_ID=$NEXT_PUBLIC_FIREBASE_PROJECT_ID \
    NEXT_PUBLIC_FIREBASE_APP_ID=$NEXT_PUBLIC_FIREBASE_APP_ID \
    CONTACT_FORWARD_EMAIL=$CONTACT_FORWARD_EMAIL \
    EMAIL_FROM=$EMAIL_FROM

RUN npm run build -w apps/web

FROM node:20-slim AS run
WORKDIR /repo
ENV NODE_ENV=production
ENV PORT=8080
ENV HOSTNAME=0.0.0.0

# `output: "standalone"` (apps/web/next.config.ts) traces the minimal
# node_modules + server needed to run, but leaves static assets and public/
# out — those are copied in separately per Next's monorepo instructions.
COPY --from=build /repo/apps/web/.next/standalone ./
COPY --from=build /repo/apps/web/.next/static ./apps/web/.next/static
COPY --from=build /repo/apps/web/public ./apps/web/public

EXPOSE 8080
CMD ["node", "apps/web/server.js"]
