import { permanentRedirect } from "next/navigation";

// Superseded by /spots/us/<state>/<locality>/<spotSlug> (see
// apps/web/user-stories.md, "Spot page - routing"). Kept as a redirect so
// existing external links/bookmarks to this URL shape keep working.
export default async function SpotBySlugRedirectPage({
  params,
}: {
  params: Promise<{ state: string; locality: string; spotSlug: string }>;
}) {
  const { state, locality, spotSlug } = await params;
  permanentRedirect(`/spots/us/${state}/${locality}/${spotSlug}`);
}
