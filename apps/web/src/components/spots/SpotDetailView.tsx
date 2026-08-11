import {
  canManageSite,
  countyPathSegment,
  getStewardByStewardId,
  getUserByUserId,
  slugify,
} from "@placekeeping/core";
import type { AuthContext } from "@placekeeping/core";
import type { Observation, Spot } from "@placekeeping/shared-types";
import Link from "next/link";
import type { ReactNode } from "react";
import { ObservationsPanel } from "@/components/forms/ObservationsPanel";
import { vegetationOptions } from "@/components/forms/spotOptions";
import { getSiteColumnData } from "@/lib/siteColumnData";
import { DeleteSpotButton } from "./DeleteSpotButton";
import { FillGeoDetailsButton } from "./FillGeoDetailsButton";
import { SiteColumn } from "./SiteColumn";
import { SpotColumns } from "./SpotColumns";
import { SpotDetailsSection } from "./SpotDetailsSection";
import { SpotTitleEditor } from "./SpotTitleEditor";
import { StewardshipSection } from "./StewardshipSection";

const vegetationLabels: Record<string, string> = Object.fromEntries(
  vegetationOptions.map((opt) => [opt.value, opt.label]),
);

// Renders a territory-page link when a path can be built, plain text
// otherwise (e.g. a county set without a state, so no slug is possible).
function territoryLink(key: string, label: string | null, path: string | null): ReactNode {
  if (!label) return null;
  return path ? (
    <Link key={key} href={path} className="underline">
      {label}
    </Link>
  ) : (
    label
  );
}

// "Mount Kisco" (a full municipality name) and "Mt Kisco" (its postal/ZIP
// name) name the same place -- normalize before comparing slugs so
// municipality isn't shown as a separate, redundant entry from postalCity.
function normalizeMuniSlug(slug: string): string {
  return slug.replace(/(^|-)mount(-|$)/g, "$1mt$2");
}

// filter(Boolean).join(", ") for a mix of strings and <Link> nodes.
function joinWithCommas(nodes: ReactNode[]): ReactNode {
  return nodes
    .filter((node) => node !== null && node !== undefined && node !== false)
    .flatMap((node, i) => (i === 0 ? [node] : [", ", node]));
}

// The address field is freeform ("Address / cross streets"), so it often
// already carries a pasted geocoder result like "123 Main St, Ossining, NY
// 10562, USA" -- postalCity/state/country baked right in. Rather than
// appending those a second time, peel any trailing mention of them off the
// address text (country, then state+zip, then postalCity, innermost-out)
// so the remaining prefix is street-only and the peeled-off text can be
// linkified in place using its original wording/casing.
const COUNTRY_SUFFIX_RE = /,?\s*(united states of america|united states|usa)\s*$/i;

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// Strips a trailing ", <value>[<trailingPattern>]" off `text`, case-
// insensitively. Returns `text` unchanged (matched: null) if `value` isn't
// actually there -- e.g. the address was typed without a zip, or the
// stored state is "New York" while the address says "NY".
function stripTrailingComponent(
  text: string,
  value: string,
  trailingPattern = "",
): { prefix: string; matched: string | null } {
  const re = new RegExp(`,?\\s*(${escapeRegExp(value)})${trailingPattern}\\s*$`, "i");
  const match = text.match(re);
  if (!match) return { prefix: text, matched: null };
  return { prefix: text.slice(0, match.index).trim(), matched: match[1] };
}

function parseAddressComponents(
  address: string | null,
  postalCity: string | null,
  state: string | null,
): {
  prefix: string | null;
  postalCityLabel: string | null;
  stateLabel: string | null;
  countryLabel: string | null;
} {
  if (!address) {
    return { prefix: null, postalCityLabel: null, stateLabel: null, countryLabel: null };
  }

  let remaining = address;

  const countryMatch = remaining.match(COUNTRY_SUFFIX_RE);
  const countryLabel = countryMatch?.[1] ?? null;
  if (countryMatch) remaining = remaining.slice(0, countryMatch.index).trim();

  let stateLabel: string | null = null;
  if (state) {
    // Zip code, if present, trails the state (e.g. "NY 10562").
    const result = stripTrailingComponent(remaining, state, "\\s*\\d{5}(-\\d{4})?");
    stateLabel = result.matched;
    remaining = result.prefix;
  }

  let postalCityLabel: string | null = null;
  if (postalCity) {
    const result = stripTrailingComponent(remaining, postalCity);
    postalCityLabel = result.matched;
    remaining = result.prefix;
  }

  return { prefix: remaining || null, postalCityLabel, stateLabel, countryLabel };
}

export async function SpotDetailView({
  spot,
  observations,
  authContext,
}: {
  spot: Spot;
  observations: Observation[];
  authContext: AuthContext | null;
}) {
  const isOwner = !!authContext?.stewardId && authContext.stewardId === spot.stewardId;
  const isCreator = authContext?.userId === spot.createdByUserId;
  // The logged-in caller's own public handle, shown as the attribution on
  // any observation they log from this page -- see users.username in
  // schema.ts (never the private `name` here, since this is visible to
  // other users on the spot's observation list).
  const observerUser = authContext
    ? await getUserByUserId(authContext.userId)
    : null;
  const observerName = observerUser?.username ?? null;
  const creatorUser = spot.createdByUserId
    ? await getUserByUserId(spot.createdByUserId)
    : null;
  const creatorProfilePath = creatorUser ? `/user/${creatorUser.userId}` : null;
  const currentSteward = spot.stewardId
    ? await getStewardByStewardId(spot.stewardId)
    : null;
  const { linkedSite, parcelGeometries, memberSpots } =
    await getSiteColumnData(spot);
  const canManageParcel =
    isOwner || isCreator || authContext?.isSystemAdmin === true;
  const canEditSite =
    !!authContext && !!linkedSite && canManageSite(authContext, linkedSite);
  const hasObservations = observations.length > 0;
  const canDeleteSpot =
    canManageParcel && (!hasObservations || authContext?.isSystemAdmin === true);

  const showAddress = isOwner || spot.addressVisibility === "public";

  // Territory/scoreboard links -- mirrors the path shapes in
  // territoryPathsForSpot (packages/core/src/territory.ts): state and
  // locality-level paths both key off the state slug, and a county path
  // gets a "-county" suffix to disambiguate it from a same-named
  // municipality.
  const stateSlug = spot.state ? slugify(spot.state) : null;
  const municipalitySlug = spot.municipality ? slugify(spot.municipality) : null;
  const postalCitySlug = spot.postalCity ? slugify(spot.postalCity) : null;
  const statePath = stateSlug ? `/spots/us/${stateSlug}` : null;
  const postalCityPath =
    stateSlug && postalCitySlug ? `/spots/us/${stateSlug}/${postalCitySlug}` : null;
  const municipalityPath =
    stateSlug && municipalitySlug ? `/spots/us/${stateSlug}/${municipalitySlug}` : null;
  const countyPath =
    stateSlug && spot.county ? `/spots/us/${stateSlug}/${countyPathSegment(spot.county)}` : null;
  // Only show municipality separately when it names a different place than
  // postalCity -- otherwise it'd just repeat the address line.
  const showMunicipality =
    !!spot.municipality &&
    normalizeMuniSlug(municipalitySlug ?? "") !== normalizeMuniSlug(postalCitySlug ?? "");

  const missingGeoFields = {
    address: !spot.address,
    state: !spot.state,
    postalCity: !spot.postalCity,
    municipality: !spot.municipality,
    county: !spot.county,
  };
  const hasMissingGeoFields = Object.values(missingGeoFields).some(Boolean);

  const {
    prefix: addressPrefix,
    postalCityLabel,
    stateLabel,
    countryLabel,
  } = parseAddressComponents(
    showAddress ? spot.address : null,
    spot.postalCity,
    spot.state,
  );

  return (
    <SpotColumns
      site={
        <SiteColumn
          spot={spot}
          linkedSite={linkedSite}
          parcelGeometries={parcelGeometries}
          memberSpots={memberSpots}
          canManageParcel={canManageParcel}
          canEditSite={canEditSite}
        />
      }
      main={
        <>
          <div>
            <SpotTitleEditor
              spotId={spot.spotId}
              name={spot.name}
              canEdit={canManageParcel}
            />
            <p className="text-sm text-neutral-500">
              {joinWithCommas([
                addressPrefix,
                territoryLink("postalCity", postalCityLabel ?? spot.postalCity, postalCityPath),
                territoryLink("state", stateLabel ?? spot.state, statePath),
                territoryLink("country", countryLabel ?? "United States", "/spots/us"),
              ])}
            </p>
            {(showMunicipality || spot.county) && (
              <p className="text-sm text-neutral-500">
                {joinWithCommas([
                  showMunicipality
                    ? territoryLink("municipality", spot.municipality, municipalityPath)
                    : null,
                  territoryLink("county", spot.county, countyPath),
                ])}
              </p>
            )}
            {canManageParcel && hasMissingGeoFields && (
              <p className="mt-1">
                <FillGeoDetailsButton
                  spotId={spot.spotId}
                  latitude={spot.latitude}
                  longitude={spot.longitude}
                  missing={missingGeoFields}
                />
              </p>
            )}
            <div className="mt-2 flex flex-wrap gap-2 text-xs">
              {spot.vegetation && (
                <span className="rounded-full bg-neutral-100 px-2 py-0.5">
                  {vegetationLabels[spot.vegetation] ?? spot.vegetation}
                </span>
              )}
              <span className="rounded-full bg-neutral-100 px-2 py-0.5">
                {spot.accessibility === "public"
                  ? "Public"
                  : "Designated members & guests"}
              </span>
              <span>Size: {spot.sizeSqft != null ? `${spot.sizeSqft.toLocaleString()} sq ft` : "N/A"}</span>
              {canDeleteSpot && (
                <DeleteSpotButton spotId={spot.spotId} spotName={spot.name} />
              )}
            </div>
            {isOwner && (
              <Link
                href={`/spots/${spot.spotId}/edit`}
                className="mt-2 inline-block text-sm font-medium underline"
              >
                Edit spot
              </Link>
            )}
            {creatorUser && creatorProfilePath && (
              <p className="mt-2 text-xs text-neutral-500">
                Added by{" "}
                <Link href={creatorProfilePath} className="underline">
                  @{creatorUser.username}
                </Link>
              </p>
            )}
          </div>

          {spot.coverPhotoUrl && (
            <img
              src={spot.coverPhotoUrl}
              alt={spot.name}
              className="h-64 w-full rounded-md border border-neutral-200 object-cover"
            />
          )}

          <StewardshipSection
            spot={spot}
            isOwner={isOwner}
            canEdit={canManageParcel}
            currentSteward={
              currentSteward
                ? {
                    stewardId: currentSteward.stewardId,
                    slug: currentSteward.slug,
                    name: currentSteward.name,
                  }
                : null
            }
          />

          <SpotDetailsSection spot={spot} canEdit={canManageParcel} />
        </>
      }
      observations={
        <ObservationsPanel
          spotId={spot.spotId}
          spotName={spot.name}
          spotVegetation={spot.vegetation}
          spotWeedLevel={spot.weedLevel}
          observations={observations}
          observerName={observerName}
          currentUserId={authContext?.userId ?? null}
          currentStewardId={authContext?.stewardId ?? null}
          isSystemAdmin={authContext?.isSystemAdmin ?? false}
        />
      }
    />
  );
}
