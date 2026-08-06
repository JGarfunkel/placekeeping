# Placekeeping

A Community Stewardship Atlas: a map and database of outdoor "Places" (gardens,
preserves, and other commonly-accessible outdoor spaces) that volunteer
"Stewards" sign up to care for and log "Observations" against over time. See
[design.md](./design.md) for the data model.

## Stack

- **Web app / API:** Next.js (App Router) in [apps/web](./apps/web) — the UI
  and the API (as Route Handlers) live in one deployable.
- **Database:** PostgreSQL + PostGIS, schema managed with Drizzle ORM in
  [packages/db](./packages/db).
- **Business logic:** framework-agnostic in [packages/core](./packages/core)
  (DB access, Firebase Admin, the auth resolver) — this is the seam a future
  standalone mobile-facing API would import instead of duplicating.
- **Shared types:** zod schemas / DTOs in
  [packages/shared-types](./packages/shared-types), safe to import from a
  future mobile app too.
- **Auth:** Firebase Authentication (Google, Facebook, Apple), mapped to a
  local `stewards` row on first login.
- **Maps:** Google Maps via `@vis.gl/react-google-maps`, with marker
  clustering.

See [ARCHITECTURE.md](./apps/web/ARCHITECTURE.md) for the reasoning behind
these choices, [user-stories.md](./apps/web/user-stories.md) for feature
status, and [GO_LIVE_CHECKLIST.md](./apps/web/GO_LIVE_CHECKLIST.md) for what's
left before a production deploy (NeonDB, Cloudflare R2, Firebase).

## Prerequisites

- Node.js 20+
- Docker Desktop (for local Postgres+PostGIS)
- A Firebase project with Google/Facebook/Apple sign-in enabled
- A Google Maps API key

## Setup

```bash
npm install
cp .env.example .env.local   # fill in real values — see below
npm run db:up                # starts Postgres+PostGIS via Docker Compose
npm run db:migrate           # applies the schema
npm run db:seed              # optional: sample stewards/places/observations
npm run dev                  # http://localhost:3000
```

### Environment variables

All variables are documented in [.env.example](./.env.example). Required to
run anything at all: `DATABASE_URL`. Required for sign-in to work:
`NEXT_PUBLIC_FIREBASE_*` and `FIREBASE_ADMIN_*`. Required for the map:
`NEXT_PUBLIC_GOOGLE_MAPS_API_KEY`. The app runs and the public pages render
without the Firebase/Maps variables set — sign-in and the map simply won't
work until they're provided.

There's a single `.env.local` at the repo root, shared across `apps/web` and
`packages/db` — Next.js only auto-loads env files from its own app
directory, so [next.config.ts](./apps/web/next.config.ts) explicitly loads
the root `.env`/`.env.local` itself.

### Firebase setup

1. Create a Firebase project, enable the Google, Facebook, and Apple sign-in
   providers under Authentication.
2. Project settings > General > Your apps > add a Web app: copy the config
   into `NEXT_PUBLIC_FIREBASE_*`.
3. Project settings > Service accounts > Generate new private key: copy
   `project_id` / `client_email` / `private_key` into `FIREBASE_ADMIN_*`
   (keep the `\n` escapes in the private key literal).

### Google Maps setup

Enable the Maps JavaScript API in Google Cloud Console, create an API key,
and restrict it by HTTP referrer to your domain(s) — it's a public,
client-side key by necessity, not a secret. Optionally create a Map ID
(Maps > Map Management) for Advanced Marker styling and set
`NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID`.

## Scripts (run from the repo root)

| Script | Purpose |
|---|---|
| `npm run dev` | Start the Next.js dev server |
| `npm run build` | Production build |
| `npm run db:up` / `db:down` | Start/stop the local Postgres+PostGIS container |
| `npm run db:generate` | Generate a Drizzle migration from `packages/db/src/schema.ts` |
| `npm run db:migrate` | Apply pending migrations |
| `npm run db:studio` | Open Drizzle Studio against the local DB |
| `npm run db:seed` | Insert sample stewards/places/observations |

## Project structure

```
apps/web            Next.js app: pages, API route handlers, client components
packages/db          Drizzle schema, migrations, seed script, DB client
packages/core        Business logic: places/observations/stewards queries, auth
packages/shared-types  zod DTOs shared across web, core, and (later) mobile
```
