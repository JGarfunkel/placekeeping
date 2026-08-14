import { resolveState } from "@placekeeping/core";
import type { TerritoryResolution } from "@placekeeping/core";
import type { Metadata } from "next";
import { buildOpenGraphMetadata } from "@/lib/ogMetadata";

// Only "us" is resolvable today (see resolveCountry in territory.ts) -- this
// mirrors that restriction rather than pretending to support more.
const COUNTRY_NAMES: Record<string, string> = {
  us: "United States",
};

// Builds the "Placekeeping - <Locality>, <State/Subdivision>, <Country>"
// page title described in user-stories.md, trimmed to whichever levels the
// resolution actually has (a state page has no locality, a country page has
// neither).
export async function buildTerritoryMetadata(
  resolution: TerritoryResolution,
): Promise<Metadata> {
  const [cc, sc] = resolution.path.split("/");
  const country = COUNTRY_NAMES[cc] ?? cc.toUpperCase();

  let parts: string[];
  if (resolution.level === 2) {
    const state = await resolveState(cc, sc);
    parts = [resolution.name, state?.name ?? sc.toUpperCase(), country];
  } else if (resolution.level === 1) {
    parts = [resolution.name, country];
  } else {
    parts = [country];
  }

  const title = `Placekeeping - ${parts.join(", ")}`;
  return buildOpenGraphMetadata({ title, path: `/spots/${resolution.path}` });
}
