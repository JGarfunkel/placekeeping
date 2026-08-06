# Architecture decisions

## Monorepo, not a single app

`apps/web` (Next.js) depends on `packages/core` (business logic) and
`packages/shared-types` (DTOs); `packages/core` depends on `packages/db`
(Drizzle schema + client). A future mobile app and a future standalone API
service would both sit alongside `apps/web` and import the same
`packages/core` / `packages/shared-types` — no logic would need to be
duplicated or rewritten to add them.

## The API lives inside Next.js (Route Handlers), not a separate service

`apps/web/src/app/api/**/route.ts` files are the API. This was chosen over
standing up a separate Express/Fastify service because:

- Route Handlers are plain HTTP endpoints returning JSON — a future React
  Native/Expo client can call them exactly like a browser does. The usual
  "coupling to Next.js" concern applies to Server Components, not Route
  Handlers.
- One deployable service means one thing to run locally and deploy, and no
  CORS/auth duplication between two services.

Every Route Handler is a thin wrapper: it parses/validates input with a zod
schema from `packages/shared-types`, then calls into `packages/core`. All the
real logic (DB queries, Firebase Admin calls) lives in `packages/core`, which
has no Next.js dependency. If a standalone mobile-facing API service is ever
needed, it's a new thin `apps/api` importing `packages/core` — a mechanical
move, not a rewrite.

**The one thing this requires up front:** every protected endpoint resolves
identity through a single function,
[`resolveAuth()`](./packages/core/src/auth.ts), that accepts *either* an
`Authorization: Bearer <firebaseIdToken>` header (the path a native mobile
app will use) *or* a session cookie (the path the web app uses). This keeps
the auth contract mobile-ready without having to change it later.

## Database: PostgreSQL + PostGIS, schema in Drizzle

- **`geography(Point,4326)`, not `geometry`**, for `places.location` —
  `geography` does great-circle distance in meters natively, which is what
  the "sites near me" query (`ST_DWithin`) needs. See
  [packages/db/src/schema.ts](./packages/db/src/schema.ts) and the query in
  [packages/core/src/places.ts](./packages/core/src/places.ts). Drizzle has
  no first-class PostGIS type, so the column is declared via `customType()`
  and read/written with raw `sql` fragments (`ST_MakePoint`, `ST_X`/`ST_Y`,
  `ST_Distance`).
- **`place_types` is a Postgres enum array + GIN index, not a join table** —
  the type list (Vegetable/herb, Ornamental, Pollinator, Wild area) is small
  and fixed in the data model, so an array gives indexable multi-select
  without join-table overhead. If that list needs to become
  admin-editable/dynamic, migrate to a join table then.
- **Steward↔Place is a simple nullable FK on `places`**, not a join table —
  it directly satisfies "filter by steward" (`WHERE steward_id = $1`) and
  "unstewarded" (`WHERE steward_id IS NULL`, served by a partial index). If
  multi-steward-per-place becomes a real requirement, the migration path is a
  `place_stewards(place_id, steward_id, role)` join table.
- **`stewards.firebase_uid`** is a unique, not-null mapping from one Firebase
  identity to one Steward row, created on first login (see
  `getOrCreateStewardByFirebaseUid` in
  [packages/core/src/stewards.ts](./packages/core/src/stewards.ts)).

### A drizzle-kit gotcha worth knowing

`drizzle-kit generate`'s SQL emitter quotes unrecognized custom column types
as a literal identifier (`"geography(Point,4326)"` — with the quotes, which
Postgres then rejects). The generated migration in
`packages/db/migrations/0000_*.sql` has that line hand-fixed to
`geography(Point,4326)` (no quotes). Future migrations that don't touch the
`location` column's type won't reintroduce this; if a migration ever alters
`location`, check the generated SQL for the same quoting bug before applying.

## Auth: Firebase Authentication, verified server-side, mapped to `stewards`

1. Client signs in with Firebase JS SDK (`signInWithPopup`), gets an ID
   token, and `POST`s it to `/api/auth/session`.
2. That handler verifies the token with Firebase Admin, runs
   get-or-create-Steward, then sets an `httpOnly`/`secure`/`sameSite=lax`
   session cookie (`createSessionCookie`).
3. `src/lib/session.ts`'s `getAuthContext()` (cached per-request via React's
   `cache()`) is the single Data Access Layer entry point used by every page
   and Route Handler that needs identity — it calls `resolveAuth()` from
   `packages/core`.

### Next.js 16 renamed `middleware.ts` to `proxy.ts`

This app targets Next.js 16, which renamed the Middleware convention to
"Proxy" (same runtime behavior, new name and location expectations — see
`apps/web/src/proxy.ts`). Per Next's own guidance, Proxy only does an
**optimistic** check (cookie presence, no cryptographic verification) before
redirecting anonymous visitors away from `/places/new` and `/me` — Proxy runs
on every navigation, including prefetches, so it must stay fast and must not
call Firebase Admin. The real security boundary is
`requireAuthContext()`/`getAuthContext()` in each page and Route Handler,
which does full verification. This two-tier pattern (fast optimistic redirect
+ real check at the data boundary) is the pattern Next.js's own docs
recommend.

## Photo content moderation

Moderation is gated by `PHOTO_MODERATION=google|none` (default `none`, which
skips it entirely — no Vision call, no `GOOGLE_VISION_*` vars needed). When
set to `google`, every photo URL on an observation is checked with Google Cloud Vision
(`packages/core/src/photoModeration.ts`) before `createObservation` inserts
the row — `SAFE_SEARCH_DETECTION` rejects likely adult/violence/racy content,
`TEXT_DETECTION` + a `bad-words` filter rejects profane text overlays (the
"meme with text" case). The check runs synchronously at submission and fails
closed: a Vision error or timeout is treated as a rejection, not a pass.
`PhotoModerationError` propagates out of `createObservation` and is turned
into a 422 by `withApiErrorHandling` (`apps/web/src/lib/apiError.ts`), the
same pattern used for database-connectivity errors.

There's deliberately no moderation-status column, review queue, or admin UI —
this is a small, authenticated-steward community, so a synchronous
reject-on-submit is the whole mechanism for now. This also means a photo is
only checked once, at submission: since pasted URLs point at content this app
doesn't control (and pasted URLs are a permanent feature, not just a bridge to
native uploads — see the "Photos" section design.md and Importing.md context),
a host could swap the image behind an already-approved URL later without
re-triggering a check. That risk is accepted for now rather than building a
periodic re-check job; a manual report-a-photo path is the intended backstop
if abuse shows up, but hasn't been built yet.

The Vision client (`packages/core/src/photoModeration.ts`) uses its own
`GOOGLE_VISION_PROJECT_ID`/`GOOGLE_VISION_CLIENT_EMAIL`/`GOOGLE_VISION_PRIVATE_KEY`
env vars, following the exact singleton/credential pattern of
`packages/core/src/firebase-admin.ts` — the recommended setup is to reuse the
Firebase Admin service account (grant it Vision API access in GCP Console)
rather than provision a second one, but the vars are kept distinct so it's
unambiguous which system consumes them.

### Native photo upload: bytes vs. URL moderation, pluggable storage

`POST /api/photos` (`apps/web/src/app/api/photos/route.ts`) accepts a file
upload, moderates it, and stores it — as opposed to a pasted URL, which is
moderated (and re-fetched) by Vision at observation-submit time. Uploads are
moderated from raw bytes via Vision's inline `content` mode
(`checkPhotoBytes` in `photoModeration.ts`) **before** the file is ever
written to storage, rather than by fetching back the URL after storing —
this was necessary, not just an optimization: Vision fetches `imageUri`
URLs from Google's own servers, which can't reach a `local`-backend URL
(`http://localhost:...`). `checkPhotoUrl` and `checkPhotoBytes` share one
`annotateAndEvaluate` helper so both paths use identical thresholds.

Because uploads are already moderated at upload time, `createObservation`
(`packages/core/src/observations.ts`) filters out any photo URL that
`isOwnStorageUrl` (`packages/core/src/photoStorage.ts`) recognizes as
pointing at our own storage before running `checkPhotoUrls` on the rest —
this avoids both a broken check (local URLs) and a redundant billed Vision
call (R2 URLs) for content already verified once.

Storage itself is backend-agnostic behind `storePhoto()` in
`photoStorage.ts`, selected via `IMAGE_STORAGE=r2|s3|gcs|local`. Only `r2`
(Cloudflare R2, via `@aws-sdk/client-s3` against R2's S3-compatible API) and
`local` (writes to `apps/web/public/uploads`, dev/testing only — not durable
across redeploys) are implemented; `s3`/`gcs` are valid config values that
throw "not implemented yet" until built out.

## Maps

`@vis.gl/react-google-maps` (Google's official React wrapper) was chosen over
the older `@react-google-maps/api` for better TypeScript support and cleaner
composition with App Router client-component boundaries. Pages that show a
map stay Server Components (they fetch place data for SEO), passing that
data as props into a small `'use client'` `MapView` that owns the
`<APIProvider>`/`<Map>` tree — this keeps the Maps JS dependency isolated to
the smallest possible client boundary. Marker clustering
(`@googlemaps/markerclusterer`) is wired in from the start since both organic
growth and a future mobile client are expected to increase the number of
Places shown at once.
