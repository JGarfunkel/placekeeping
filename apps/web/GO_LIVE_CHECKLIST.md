# Go-live checklist

Everything needed to move from local Docker Postgres + local file storage to
a real deployment: NeonDB (database), Cloudflare R2 (photo storage), Firebase
(auth), and Resend (verification/password-reset email) configured for
production, plus the app-level steps around them. Check items off in order —
NeonDB first, since the app can't boot without `DATABASE_URL`.

## 1. NeonDB

- [X] Create a Neon project (pick a region close to your users/host).
- [X] Confirm the `postgis` extension is available and enable it:
      `CREATE EXTENSION IF NOT EXISTS postgis;` (run once via Neon's SQL
      editor, or as the first thing `db:migrate` connects to — the app's own
      migration doesn't create the extension, since the local Docker image
      bakes it in already; Neon doesn't).
- [X] Copy the **pooled** connection string (Neon's "Connection string" with
      `-pooler` in the host, not the direct one) into `DATABASE_URL` for the
      deployed app. Use the direct (non-pooled) string only for one-off admin
      work (`db:migrate`, `db:studio`) if the pooler gives you trouble with
      `drizzle-kit`.
- [X] Point `DATABASE_URL` (in your local `.env.local`, temporarily) at the
      Neon connection string and run `npm run db:migrate` — this applies the
      single baseline migration (`packages/db/migrations/0000_*.sql`) to the
      fresh Neon database. Sanity-check with `npm run db:check` (should
      report all 10 tables readable, per [checkTables.ts](../packages/db/src/checkTables.ts)).
- [X] Set up your first system admin: after someone signs up for real, run
      `npm run db:set-admin -- <email or username>` against the Neon DB (see
      [set-admin.ts](../packages/db/src/set-admin.ts)) — there's no
      self-service way to become the first admin.
- [ ] Decide on a backup/PITR policy in Neon's console (Neon does automatic
      point-in-time restore on paid tiers — confirm the retention window
      matches your risk tolerance).

## 2. Cloudflare R2 (photo storage)

- [X] Create an R2 bucket.
- [X] Cloudflare dashboard → R2 → **Manage API Tokens** → create a token
      scoped to **Object Read & Write** on that bucket only (not
      account-wide). Copy the Access Key ID / Secret Access Key into
      `R2_ACCESS_KEY_ID` / `R2_SECRET_ACCESS_KEY`.
- [X] Set `R2_ACCOUNT_ID` (from the Cloudflare dashboard URL or R2 overview
      page) and `R2_BUCKET_NAME`.
- [X] Enable public access for the bucket: either turn on the free `r2.dev`
      subdomain (bucket → Settings → Public Access) or attach a custom
      domain. Put that origin (not the S3 API endpoint) in
      `R2_PUBLIC_BASE_URL` — objects are read back at
      `{R2_PUBLIC_BASE_URL}/{key}` (see [photoStorage.ts](../packages/core/src/photoStorage.ts)).
- [ ] Set `IMAGE_STORAGE=r2` in the deployed environment (it defaults to
      `local`, which writes to `apps/web/public/uploads` — fine for dev,
      **not durable** across redeploys, don't ship with this).
- [ ] Decide on `PHOTO_MODERATION` (`none` or `google`) — see the Firebase
      section below, since the recommended setup reuses the same service
      account for Cloud Vision.
- [ ] After deploying, upload a real photo through the app (an observation or
      a spot cover photo) and confirm it renders back from the R2 public URL,
      not a `localhost` URL.

## 3. Firebase (auth, and optionally Cloud Vision moderation)

- [ ] Firebase Console → Authentication → Sign-in method: confirm Google,
      Facebook, and Email/Password are enabled for the **production**
      project (if you've been developing against a separate/test Firebase
      project, double check you're configuring the one prod actually points
      at).
- [ ] Authentication → Settings → **Authorized domains**: add your
      production domain(s) — this is the most common cause of an OAuth
      popup silently failing/hanging in a new environment, since Firebase
      rejects sign-in from a domain it doesn't know about.
- [ ] Project settings → General → Your apps → Web app: copy the config into
      `NEXT_PUBLIC_FIREBASE_API_KEY` / `_AUTH_DOMAIN` / `_PROJECT_ID` /
      `_APP_ID` for the deployed environment (these are public/client-side —
      not secrets, but they must match the prod Firebase project, not a dev
      one).
- [ ] Project settings → Service accounts → **Generate new private key**:
      copy `project_id` / `client_email` / `private_key` into
      `FIREBASE_ADMIN_PROJECT_ID` / `_CLIENT_EMAIL` / `_PRIVATE_KEY`. Keep
      the private key's `\n` escapes literal — the app un-escapes them at
      runtime ([firebase-admin.ts](../packages/core/src/firebase-admin.ts)).
- [ ] Authentication → Templates → **Password reset**: point the action URL
      at `https://<your-domain>/reset-password/confirm` (see
      [user-stories.md](./user-stories.md), Login/Authentication) — otherwise
      the emailed reset link won't land back in the app.
- [ ] Apple sign-in is scaffolded (`getAppleProvider()` /
      "Continue with Apple" in [login/page.tsx](./src/app/login/page.tsx))
      but needs real config to work end-to-end: an Apple Developer Services
      ID + a registered redirect URI pointed at Firebase's auth handler, plus
      enabling Apple as a provider in the Firebase console. Either finish
      this before go-live or hide the button.
- [ ] If turning on `PHOTO_MODERATION=google`: enable the Cloud Vision API on
      the same GCP project backing your Firebase Admin service account, and
      grant that service account Vision API access (IAM & Admin → IAM) —
      the recommended path is reusing the Firebase Admin credentials rather
      than provisioning a second service account (see
      [ARCHITECTURE.md](./ARCHITECTURE.md), "Photo content moderation").
      Leave it `none` (the default) if you'd rather ship without moderation
      initially.
- [ ] Sign in for real against production once deployed, for each enabled
      provider, before calling it done.

## 4. Resend (verification & password-reset email)

Signup email verification and "forgot password" links are generated by
Firebase Admin but **sent** by us via [Resend](https://resend.com) — Firebase's
own hosted mailer is no longer used for these. Locally this defaults to
`EMAIL_PROVIDER=console` (logs the email instead of sending it, no account
needed); production must switch it over.

- [ ] Create a Resend account and add your sending domain (Domains → Add
      Domain) — you cannot send from an unverified domain.
- [ ] Add the DNS records Resend gives you (SPF/DKIM, typically a couple of
      `TXT`/`CNAME` records) at your domain registrar/DNS host, then wait for
      the domain to show **Verified** in the Resend dashboard before relying
      on it — sends will fail (or land in spam) until then.
- [ ] Create an API key (API Keys → Create API Key) and set `RESEND_API_KEY`
      in the deployed environment.
- [ ] Set `EMAIL_FROM` to an address on the verified domain, e.g.
      `"Atlas <verify@yourdomain.com>"`.
- [ ] Set `APP_BASE_URL` to the production origin (e.g.
      `https://yourdomain.com`) — this builds the continue-URL for both the
      verification link and the password-reset link, so a bad value here
      means users land somewhere wrong after clicking the emailed link.
- [ ] Set `EMAIL_PROVIDER=resend` in the deployed environment (it defaults to
      `console`, which never actually sends anything — don't ship with this).
- [ ] After deploying, sign up for real and confirm the verification email
      arrives (check spam the first time), then run the "forgot password"
      flow end-to-end and confirm that email arrives too.
- [ ] Keep the Firebase Console → Authentication → Templates → Password reset
      action URL pointed at `/reset-password/confirm` (see step 3 above) —
      Resend only changes who sends the email, Firebase still issues and
      validates the underlying reset code.

## 5. Cross-cutting / general

- [ ] `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY`: restrict it by HTTP referrer to your
      production domain(s) in Google Cloud Console (it's public/client-side
      by necessity, restriction is the actual security boundary).
- [ ] Confirm the deployment host sets `NODE_ENV=production` — the session
      cookie's `secure` flag is gated on this
      ([session.ts](./src/lib/session.ts)); serving over HTTP in an
      environment that isn't marked production would silently ship an
      insecure cookie.
- [ ] Run `npm run lint` and `npm test` clean before the first deploy.
      (`npm run typecheck` currently doesn't work at the repo root — no
      composite TS project-references setup exists yet; typecheck
      per-package instead: `npx tsc -p packages/core --noEmit`, etc., or fix
      the root config first.)
- [ ] `npm run build` locally against production-shaped env vars at least
      once before the first real deploy, to catch anything env-dependent
      that only breaks in a production build.
- [ ] Before running the very first migration against Neon (or any future
      migration against prod), use the **pause-writes** admin control
      ([/admin/settings](./src/app/admin/settings/page.tsx)) if the app is
      already receiving traffic — flip it on, migrate, flip it off. Not
      needed for the very first deploy (nothing is live yet), but this is
      the mechanism for every deploy after.

## Known gaps to be aware of at launch (not blockers, but worth knowing)

See [user-stories.md](./user-stories.md) for the full status list. Biggest
ones: no admin dashboard beyond the pause toggle (no user management or
moderation queue), no edit/delete for an existing observation, and `/about`
is still a content stub.
