# User Stories

Status key: ✅ Done · 🟡 Partial · ⬜ Not started

## Login/Authentication

1. ✅ User can login through standard auth providers
    - ✅ Google
    - 🟡 Apple/iCloud (TBD) — `getAppleProvider()` and the "Continue with Apple" button exist in [login/page.tsx](../apps/web/src/app/login/page.tsx), but this needs a real Firebase Apple provider config + a device/App ID from Apple before it'll work end-to-end
    - ✅ Facebook
2. ✅ Support Basic Auth & password management — via Firebase Auth's built-in Email/Password provider, not custom password storage; no new DB column since Firebase remains the sole identity/credential store, same as the OAuth providers above
    - ✅ signup, supply passwords; requires unique email address — [signup/page.tsx](../apps/web/src/app/signup/page.tsx); uniqueness enforced by Firebase's "one account per email address" project setting, not a DB constraint
    - ✅ generate email verification — Firebase Admin generates the link (`sendVerificationEmailForUser` in [auth.ts](../packages/core/src/auth.ts)) and we send it ourselves via Resend ([email.ts](../packages/core/src/email.ts)), not Firebase's own hosted mailer; triggered on signup via `POST /api/auth/verification-email` in [signup/page.tsx](../apps/web/src/app/signup/page.tsx), plus a not-verified banner + resend button on [me/page.tsx](../apps/web/src/app/me/page.tsx) / [ResendVerificationButton.tsx](../apps/web/src/components/forms/ResendVerificationButton.tsx). `EMAIL_PROVIDER=console` (dev default) logs instead of sending; production needs `EMAIL_PROVIDER=resend` — see [GO_LIVE_CHECKLIST.md](./GO_LIVE_CHECKLIST.md)
    - ✅ add account recovery, with password reset — same Resend-backed link generation (`requestPasswordResetEmail`) via `POST /api/auth/password-reset-email`, requested from [reset-password/page.tsx](../apps/web/src/app/reset-password/page.tsx) and confirmed on [reset-password/confirm/page.tsx](../apps/web/src/app/reset-password/confirm/page.tsx) — confirmation still goes through Firebase's own oobCode verification regardless of who sent the email, so the Firebase console's password-reset action URL must still point at `/reset-password/confirm` for the emailed link to land in-app


## Header

1. 🟡 Profile icon
  - 🟡 if logged in — [layout.tsx](../apps/web/src/app/layout.tsx) shows a plain "My profile" text link, not an icon with initials, and it does go to `/me`
  - ⬜ add a menu item for logout
  - 🟡 if not logged in — links to a full `/login` page, not an inline login dialog
2. ⬜ About - with link to about document page — the About link currently lives only in the home page header ([page.tsx](../apps/web/src/app/page.tsx)), not the global `<header>` in layout.tsx, so it's missing from every other page (spot, site, steward, profile). [about/page.tsx](../apps/web/src/app/about/page.tsx) itself is just a "Content coming soon." stub with no real content yet.

## Main Page

1. ✅ View the map with spots marked with pins
2. ✅ View the legend under the map
3. ✅ Location/radius/vegetation/unstewarded filters ([SpotFilters.tsx](../apps/web/src/components/SpotFilters.tsx)), "Use my location" geolocation, and a text list of results below the map

## Map Panel

1. ✅ Presently supporting Google - need to support other layers — [MapView.tsx](../apps/web/src/components/map/MapView.tsx) branches between a Leaflet tree (OSM Streets / Esri Aerial, default) and the retained Google tree, switchable via a layers control; see [local/map-provider.md](map-provider.md)
2. ✅ For the spot dialog box, add the cover photo for the spot — [QuickAddSpotDialog.tsx](../apps/web/src/components/map/QuickAddSpotDialog.tsx) now has a cover-photo upload field (same `/api/photos` R2 + moderation path as observations), sent as `coverPhotoUrl` on spot creation
3. ✅ Default should be street map, not Aerial — [baseLayers.ts](../apps/web/src/components/map/baseLayers.ts) `DEFAULT_BASE_LAYER = "streets"` (CartoDB Voyager), not `"aerial"`

## Generic photo upload

1. ✅ add a button "Upload new photo" to the main page and each scoreboard page.
This would handle a photo upload and examine the EXIF information for the timestamp and geo-location.
Once uploaded, the server would look for nearby spots, and allow the user to select an existing one, or indicate to create a new spot, and update the dialog box accordingly. — [UploadPhotoButton.tsx](../apps/web/src/components/photos/UploadPhotoButton.tsx) / [UploadPhotoDialog.tsx](../apps/web/src/components/photos/UploadPhotoDialog.tsx), wired into [page.tsx](../apps/web/src/app/page.tsx) and [TerritoryView.tsx](../apps/web/src/components/spots/TerritoryView.tsx) (the shared scoreboard component for all territory routes). `/api/photos` now also extracts GPS via `exifr.gps()` ([photoMetadata.ts](../packages/core/src/photoMetadata.ts)); when present, a 20m `findNearbySpots` lookup offers existing spots to attach the photo to (as a new observation) or "create a new spot" (reusing `QuickAddSpotDialog`, prefilled with the EXIF coordinates + photo). When GPS is absent (screenshots, stripped metadata), falls back to a manual spot-name search or a link to the full `/spots/new` form with the photo prefilled as cover.

## Adding a spot from map

1. ✅ Logged-in user can right-click to add a spot, brings up pop-up... upon submit, goes to the spot page — [QuickAddSpotDialog.tsx](../apps/web/src/components/map/QuickAddSpotDialog.tsx), triggered by `onContextmenu` in MapView.tsx. Note: on submit it currently offers "Add more details" (→ edit page) or "Done" (closes dialog, stays on map) rather than navigating straight to the spot page — worth deciding if that's the intended flow or a gap.
2. ✅ After a spot is added/edited/deleted, the associated scoreboards update for: country, state, county (if set), municipality, and postalCity (if it names a different place than the municipality, per the case-2/3 rule below) — [`adjustTerritoryCounts`](../packages/core/src/territory.ts).

## Spot scoreboards

### 0. Municipality vs postalCity determination

In the U.S., postalCity generally has three different relationships with the municipality

1. Equivalent: they are the same; use the municipality — ✅ same slug either way, naturally collapses to one scoreboard entry, no special-casing needed.
2. Within: the postalCity is a community, hamlet, or a Census-Designated Place largely within the municipality. In this case, include the spot within both the municipality and the postalCity. — ✅ this is the default: a postalCity distinct from the municipality is counted under both.
3. Expansive: the postalCity expands beyond its namesake municipality (In NY: White Plains, Scarsdale, Mount Kisco have known expansive zip codes). If a spot is in town A with different postalCity B, and B exists as its own town, then we should drop the need to index the spot in B. In effect, we would declare that White Plains, Scarsdale, and Mount Kisco are municipal entities only, and have no postalCity entity. A search for /us/ny/white-plains would bring up a map and scoreboard for spots in the municipal city of White Plains; those in other towns with a White Plains postalCity would not be tallied against White Plains. — ✅ implemented, with a caveat: this only excludes a postalCity once it's *already* been confirmed (via a prior page visit) to be a real city/town/village. A never-visited postalCity name defaults to case 2 (included) even if it would turn out to be case 3 — and even after that first visit resolves it, only *future* saves are corrected; spots already counted under it aren't retroactively removed. No live GIS call happens at save time to check this — only our own cached data.

1. `/spots/<id>` - opens the spot and renders the page with that id.
2. When no spot id is present, the system understands the request as a territory view (not a specific spot): it determines the requested granularity from however many segments are given, finds the matching polygon, and derives the map center + zoom from it. It displays a scoreboard/scoreboard alongside the map for each.
   * `/spots/<cc>` - country level. `cc` is ISO 3166-1 — only `us` is supported today. For countries like the US, follow the standard online-map convention of treating the contiguous mainland as the focus entity by default (zooming out to include Alaska/Hawaii would shrink the mainland too much); AK/HI are reachable on their own via the subdivision-level route below.
   * `/spots/<cc>/<sc>` - subdivision/state level. `sc` is ISO 3166-2. ✅ Resolves for any of the 50 states + DC (via the US Census Bureau's TIGERweb service) — not NY-only.
   * `/spots/<cc>/<sc>/<mc>` - municipal level. `mc` is a municipality or zipCity - prefer whichever is the more logical grouping (zipCity may make more sense than municipality in some US cases). Dashes in `mc` may represent either a literal dash or a space in the name, so lookup must try both when matching.
     * ✅ Lookup order: check the state's list of municipalities first (NY only, via NY's own civil-boundaries service — the disambiguation rules below need real municipality-type data that only NY has been wired up for), then fall back to ZIP code boundaries (nationwide, via a public "USA ZIP Code Boundaries" layer, matched by USPS postal city name). E.g. "Mount Kisco" resolves to the municipality, not the zipcode of the same name — but for any non-NY state, or an NY name that matches no civil boundary, it now falls through to the ZIP layer instead of 404ing.
     * Prefer the encompassing town over a village within it (e.g. "Ossining" resolves to the town, not the village).
     * Some names (NYS and possibly other states) refer to two distinct municipalities; resolve as follows:
       * village inside a town, sharing a name -> choose the town
       * town next to a same-named city in the same county (e.g. Rye) -> choose the city
       * city and town(s) sharing a name in different counties (e.g. Middletown) -> choose the larger one, if determinable
     * When the name alone is ambiguous, the URL may qualify it with a type suffix, e.g. `middletown-city`, `middletown-town`, or `-zip` to force the ZIP fallback explicitly.
3. `/spots/<cc>/<sc>/<mc>/<slug>` - exactly 4 segments opens a specific spot by its slug. The first 3 segments match the territory levels above (country/state/zipCity-or-municipality); the 4th is the spot's own slug (name, special chars replaced by dashes). Segment count is what disambiguates this from item 2's territory routes: 1-3 segments = territory view, exactly 4 = a spot's slug.
   * As described under "viewing a spot" below, a user with editor rights on the spot can edit the slug and choose between zipCity and municipality for the 3rd segment.
4. ✅ Territory resolution is backed by a persistent DB table (`subdivisions`), not just in-memory — the external GIS/ZIP lookup only runs the first time a territory is actually visited, with a small in-process map as a pure perf layer in front of it (avoids a DB round trip on repeat hits within one server process). The same table also carries a per-category spot count (`spot_counts`, jsonb) per territory, updated eagerly on every spot save (see item 2 above and section 0) — the scoreboard/scoreboard reads from this, not a live query over `spots`. `level` is a plain 0/1/2 depth (country/state/locality), not a US-specific label; `type` names the jurisdiction kind (`country`, `state`, `county`, `city`, `town`, `village`, `zip`, and reserved for future use: `borough`, `township`, `district`) and, once resolved, is always suffixed onto a level-2 path (e.g. `-county`, `-village`).
5. ✅ Scoreboard display: a territory page shows a toggle between **Scoreboard** (the next level of subdivisions that have at least one spot, ranked by count — e.g. a state page lists its counties; a county page lists its municipalities — or, at the finest grain with nothing further to drill into, this territory's own category breakdown, e.g. "Stewarded garden — 3") and **List** (the plain list of spots in this territory). Categories are `${stewarded ? "stewarded" : "unstewarded"}-${purpose ?? "none"}` (stewarded = has a `stewardId`).
6. ⬜ Known gap: a spot-save-time municipality path is keyed by the spot's own raw text (e.g. "ossining"), which may not match the GIS-canonical path a page visit later resolves to (e.g. "ossining-town") if the spelling doesn't exactly match the civil-boundary layer's name field. Not automatically reconciled.
7. Update the page's TITLE to reflect the location: "Placekeeping - <Locality>, <State/Subdivision>, <Country>"

## Spot page - viewing a spot

1. ✅ Spot shows Site column at left, Spot in the middle column, Observations at right — [SpotDetailView.tsx](../apps/web/src/components/spots/SpotDetailView.tsx) / [SpotColumns.tsx](../apps/web/src/components/spots/SpotColumns.tsx)
2. ✅ Owner can edit spot details, stewardship info (needs/plans/education/weed level), and add observations from this page
3. ✅ Spot creator/owner/admin can move a spot on the map by left-clicking it - and dragging it. when they stop dragging, show a dialog popup to confirm moving the spot - this will update the record. — draggable marker + [MoveSpotDialog.tsx](../apps/web/src/components/map/MoveSpotDialog.tsx) confirm step in both [LeafletMapView.tsx](../apps/web/src/components/map/LeafletMapView.tsx) and [GoogleMapView.tsx](../apps/web/src/components/map/GoogleMapView.tsx), gated by the same owner/creator/admin check (`canManageSpot`) as the PATCH route
4. ✅ Spot creator/steward/admin can delete a spot if no observations; if observations, only admin can delete a spot. — `DELETE /api/spots/[spotId]` now exists alongside create and patch, gated by `canManageSpot` plus an admin-only override once `spotHasObservations` is true; [DeleteSpotButton.tsx](../apps/web/src/components/spots/DeleteSpotButton.tsx) is a trash-icon control on the spot details line, redirecting home after confirm. Observations cascade-delete at the DB level.
5. ✅ Add a "Added By <username>" text in the top details section above the photo, and have that link to the profile page for that user — [SpotDetailView.tsx](../apps/web/src/components/spots/SpotDetailView.tsx) shows "Added by {creatorSteward.name}", linking to `/user/[userId]` ([user/[identifier]/page.tsx](../apps/web/src/app/user/[identifier]/page.tsx)) when the creator is an individual steward, falling back to `/stewards/[stewardId]` for group-created spots since there's no single user to attribute there
6. 🟡 Support url slugs as the default navigation. allow the user to edit the slug in a collapsible "Details" section under Stewardship. The full slug should combine, separated by /'s:

  * 2-letter country code ISO_3166-1
  * 2-letter state or province code ISO_3166-2
  * zipCity or municipality name
  * name of spot (replacing special chars with dashes)

The user should see both the zipCity and the municipality name.

As user with editor rights (admin, creator, steward member) can:

* ✅ check whether to use zipCity or municipality — [SpotForm.tsx](../apps/web/src/components/forms/SpotForm.tsx) has a "Use municipality (instead of postal city) in this spot's URL" checkbox (`useMunicipalityForSlug`), and [computeSpotSlug](../packages/core/src/slug.ts) recomputes `slugState`/`slugLocality`/`slug` from it on save; the four-segment route itself resolves via [SpotDetailView.tsx](../apps/web/src/components/spots/SpotDetailView.tsx)/[spotRoute.ts](../apps/web/src/lib/spotRoute.ts).
* ⬜ update the slug — the checkbox above only picks *which* locality (municipality vs postal city) feeds the slug; there's no separate collapsible "Details" section, and no field to directly override the generated slug text itself.

## Adding a site

1. ✅ On the spot page, if no site, spot creator can click the "Find Parcels" button to determine the parcels and the associated site — implemented as "Discover parcel" in [SiteDiscoveryPanel.tsx](../apps/web/src/components/spots/SiteDiscoveryPanel.tsx), including owner-of-record reveal for institutional parcel classes and a join-existing-site-or-create-new flow
2. ✅ Editing an existing site's details (purpose, legal owner, stewardship program/ref) — [SiteDetailsEditor.tsx](../apps/web/src/components/sites/SiteDetailsEditor.tsx) on [sites/[siteId]/page.tsx](../apps/web/src/app/sites/[siteId]/page.tsx), gated by `canManageSite`, saving via `PATCH /api/sites/[siteId]` ([route.ts](../apps/web/src/app/api/sites/[siteId]/route.ts)) / `updateSite` ([sites.ts](../packages/core/src/sites.ts))
3. 🟡 Add a "Added By <username>" below the map, and have that link to the profile page for that user — `sites/[siteId]/page.tsx` shows "Added by {createdByUsername}" (via a `users` join in `getSiteById`), but as plain text, not a link to `/user/[identifier]` — small gap vs. the spot page's equivalent (item 5 below)

## Adding an observation

1. ✅ From the spot page, logged-in user can add an observation — [observations/new/page.tsx](../apps/web/src/app/spots/[spotId]/observations/new/page.tsx), [ObservationForm.tsx](../apps/web/src/components/forms/ObservationForm.tsx)
2. ⬜ If no cover photo exists for the spot, then make the first observation photo the cover photo — `createObservation` ([observations.ts](../packages/core/src/observations.ts)) stores the observation's own `photoUrls` but never touches `spots.coverPhotoUrl`; not implemented
3. ⬜ Editing or deleting an existing observation — no update/delete route exists for observations, only create (`POST /api/spots/[spotId]/observations`)
4.  ✅ Observer can attach photos to an observation, uploaded directly (not just pasted URLs) — Cloudflare R2 upload path behind the `IMAGE_STORAGE` switch plus Cloud Vision SafeSearch moderation on upload, per [photoStorage.ts](../packages/core/src/photoStorage.ts) / [photoModeration.ts](../packages/core/src/photoModeration.ts) / [api/photos/route.ts](../apps/web/src/app/api/photos/route.ts). Open question carried over from prior review: pasted URLs aren't re-checked post-approval.
5. ⬜ Update the name in the observation: make it a hyperlink to add to the profile for that user


## Site panel

1. ✅ The site loads to the left alongside the spot (which is in the middle). Shows list of parcels and list of sites — [SiteColumn.tsx](../apps/web/src/components/spots/SiteColumn.tsx) / [SiteMapAndParcels.tsx](../apps/web/src/components/sites/SiteMapAndParcels.tsx) show the site's parcel list and sibling spots; "list of sites" reads as a typo for "list of spots" given what's implemented — flag if a literal multi-site list was intended instead

## Associating to a steward

1. After creating a spot, the user can select a steward using CreateGroupStewardForm. It should default to any steward the user is an admin of, or then a member of.
2. If there's no steward, the user can fill in a name, and then be prompted to create a record for it -- which should come up in a dialog box. We're assuming that the creator is affiliated with the steward. The user should fill out the url and the contact (email address) - and a note would go to the contact to verify the steward record (which would update level from 0 to 1). And then, after the record is created, we'll need to link record ID properly back to the spot record.

## Steward page

1. ✅ Steward is a group entity, which can be associated with multiple users — a separate `users` table now exists ([schema.ts](../packages/db/src/schema.ts)) with `stewards.userId` (nullable, set for individual self-service stewards) and a `stewardMembers` join table (`stewardId`, `userId`, `role`: admin/member) for group rosters. System admins create a group steward ([/admin/groups/new](../apps/web/src/app/admin/groups/new/page.tsx)) and designate its first admin; group admins then add existing users by email, remove, and promote/demote members from [stewards/[identifier]/manage/page.tsx](../apps/web/src/app/stewards/[identifier]/manage/page.tsx) / [StewardMembersManager.tsx](../apps/web/src/components/forms/StewardMembersManager.tsx), gated by `isStewardGroupAdmin`. Note: members are added by looking up an existing account's email, not an invite-a-new-signup flow.
2. 🟡 Steward page should list all associated spots - TBD — [stewards/[identifier]/page.tsx](../apps/web/src/app/stewards/[identifier]/page.tsx) only offers a "View this steward's spots" link that jumps to the home map pre-filtered by `stewardId`; it doesn't list the spots inline on the steward's own page
3. *(not originally listed)* 🟡 Find/search for a steward by name — `GET /api/stewards/search` exists ([route.ts](../apps/web/src/app/api/stewards/search/route.ts)) and already feeds the "owner match" suggestion in the site-join panel, but there's no user-facing steward search box (e.g. on the main page or header)
4. ✅ Allow for linking of logo image, or uploading of image for the steward page. Use Google CloudVision API. — `stewards.logoUrl` ([schema.ts](../packages/db/src/schema.ts)), edited via the "Logo" [PhotoUploadField.tsx](../apps/web/src/components/forms/PhotoUploadField.tsx) in [StewardProfileForm.tsx](../apps/web/src/components/forms/StewardProfileForm.tsx). Same upload path as spot cover photos (`POST /api/photos`, Cloud Vision SafeSearch on upload) plus a "paste an image URL" fallback, moderated via `checkPhotoUrls` in `updateSteward` ([stewards.ts](../packages/core/src/stewards.ts)) when the URL isn't our own storage. Shown on the public steward page.
5. ✅ Steward admin or site admin has ability to edit properties on page — `PATCH /api/stewards/[stewardId]` ([route.ts](../apps/web/src/app/api/stewards/[stewardId]/route.ts)) already gated this on `isSystemAdmin || isStewardGroupAdmin` before the logo field existed; the new logo field is covered by the same check.

## User Profile page

1. ✅ Reachable via /user/<uuid> or /user/username — [user/[identifier]/page.tsx](../apps/web/src/app/user/[identifier]/page.tsx) resolves the `identifier` param as a UUID (`getUserByUserId`) or username (`getUserByUsername`, added in [users.ts](../packages/core/src/users.ts)) and shows the account's `username` (never the private `name`), its individual steward profile link if `publicDisplay`, its public groups, its created spots, and its observation history — see items 3-5 below for those three sections.
2. ✅ Allow update of username - this should check for uniqueness; it should be case-insensitive, and match alphanumeric|\-|_ — `usernameSchema` ([user.ts](../packages/shared-types/src/user.ts)) now allows `-` alongside `_` (still no `.`), and `usernameSlugify` ([username.ts](../packages/core/src/username.ts)) matches. `updateUsername()` ([users.ts](../packages/core/src/users.ts)) does a case-insensitive pre-check against `users_username_lower_idx` before writing, exposed via `PATCH /api/users/me` ([route.ts](../apps/web/src/app/api/users/me/route.ts)) and a form on `/me` ([UsernameForm.tsx](../apps/web/src/components/forms/UsernameForm.tsx)).
3. ✅ Show associated steward groups — added `listStewardsForUser()` ([stewardMembers.ts](../packages/core/src/stewardMembers.ts)), which unlike `listStewardsAdministeredByUser` returns every group regardless of role. `/me` now shows a "Your groups" list (admin and member, with an "(admin)" tag) and the public `/user/[identifier]` page shows the subset with `publicDisplay` true.
4. ✅ Show list of observations — `listObservationsByObserver()` ([observations.ts](../packages/core/src/observations.ts)) joins in the spot name and feeds an "Observations" section on `/user/[identifier]`, keyed off the viewed account's `userId` (`observations.observerId` is a direct users FK, not a steward one — every logged-in caller can log an observation regardless of whether they've also signed up as a steward). Not shown on `/me` itself yet, only the public profile page.
5. ✅ Show associated created spots — `listSpotsByCreator()` ([spots.ts](../packages/core/src/spots.ts)), same shape/caveat as item 4 above, feeds a "Spots added" section on `/user/[identifier]`.
6. ✅ Allow for linking of profile photo or uploading of photo for profile. Use Google CloudVision API for images — `users.photoUrl` ([schema.ts](../packages/db/src/schema.ts)), edited on `/me` via [ProfilePhotoForm.tsx](../apps/web/src/components/forms/ProfilePhotoForm.tsx) (auto-saves through `PATCH /api/users/me`), same upload-or-paste-URL [PhotoUploadField.tsx](../apps/web/src/components/forms/PhotoUploadField.tsx) as the steward logo above, moderated via `checkPhotoUrls` in `updateUserProfile` ([users.ts](../packages/core/src/users.ts)) for pasted URLs. Shown as an avatar on the public `/user/[identifier]` page.
7. 🟡 A user's profile page can be edited by that user, or the site admin — self-edit works (username, photo); there's no admin-edit-any-user route or UI yet, matching the "user management ... remain unbuilt" gap noted under Admin below.

## Admin

1. 🟡 Admin can see parcel owner-of-record for any spot, not just their own — `stewards.isAdmin` gates the "Show owner" reveal in [SiteDiscoveryPanel.tsx](../apps/web/src/components/spots/SiteDiscoveryPanel.tsx) alongside spot ownership
2. ✅ Admin can pause/resume writes site-wide ahead of a database migration/upgrade — [/admin/settings](../apps/web/src/app/admin/settings/page.tsx) toggles the `app_settings.writes_paused` singleton row via `PATCH /api/admin/settings`; while paused, every non-GET/HEAD API request 503s (gated centrally in [apiError.ts](../apps/web/src/lib/apiError.ts)'s `withApiErrorHandling`, except the settings route itself and `/api/auth/session`) and a site-wide banner shows. Linked from the header when `isSystemAdmin`. This is still a single toggle, not a general admin dashboard — user management and a moderation queue remain unbuilt.
