The data model

Four tables:

A Spot is a pin — the point a steward drops on the map, and the container
for its observations. Carries ecological attributes (vegetation, weed
level, purpose) along with the stable facts (where, how big, who owns it).

A Site is an area — the land-unit-of-record a spot may belong to (a whole
park or preserve, say, as opposed to the one garden bed a steward actually
tends within it). Carries the boundary and the external identifiers
(parcel/GIS, Homegrown National Park, stewardship program of record).
Optional: most spots don't have one yet.

An Observation is a moment — what was seen or done on a given visit. One
spot collects many observations over the years, so the inventory becomes a
history, not just a snapshot.

A Steward is a person or group. Keeping them separate means one steward
can care for several spots, stewardship can change hands, and people get
credited and contacted.

Photos live outside the database (in Google Photos, Drive, S3, or
iNaturalist) and are referenced by link, or uploaded directly — either way
the inventory itself never bloats with image files.

SITES ──────┐

           │ a site has many

           ▼

       SPOTS ──────┐

                  │ one spot has many

                  ▼

             OBSERVATIONS ──── PHOTOS (links or uploads)

SPOTS ──── STEWARDS  (a steward cares for one or more spots)

Table 1 · Spots

Spots

— one row per pin

spot_id KEY	Unique identifier for the spot.

name	Common name (e.g., "Roaring Brook School Pollinator Garden").

latitude / longitude	The single most important field for mapping — captured by dropping a pin or using a phone's GPS.

address	Street address or nearest cross streets.

parcel_id	Tax map / parcel number where known — links the record to the municipal tax roll and GIS.

municipality / county	For grouping and county-level coordination.

size_sqft	Approximate area in square feet.

whole_lot	Yes / No — is this the entire lot or only part of it?

legal_owner	Who holds title (town, school district, HOA, private owner, land trust).

accessibility	Pick list: Public · Designated members & guests (school, private club).

purpose	Garden · Monument or memorial · Wild area · None.

vegetation / weed_level	What's growing there and how much of it is weeds — feeds the map pin's glyph and color.

educational_component	Yes / No + notes — signage, school programs, volunteer days, tours.

steward_id LINK	Points to the Stewards table.

site_id LINK	Points to the Sites table — nullable; most spots don't have one yet.

photo_album_url / cover_photo_url	Links to the spot's photo collection.

inaturalist_url	Link to the iNaturalist place or project for species records.

date_added / last_verified	Keeps the inventory honest about how fresh each entry is.

Table 2 · Sites

Sites

— one row per land-unit-of-record

site_id KEY	Unique identifier for the site.

name	Common name (e.g., "Riverside Park").

purpose	Recreation · Trails · Multipurpose · Preserve · School.

geom	The boundary polygon, once surveyed — nullable; a site can exist before its boundary is drawn.

gis_open_space / gis_land_use	Codings from external GIS layers.

hnp_map_number	Homegrown National Park map number, where registered.

stewardship_program / stewardship_ref	The external program of record a site is tracked under, and its id within that program.

created_at / updated_at	Standard bookkeeping timestamps.

Table 3 · Observations

Observations

— one row per visit or update

observation_id KEY	Unique identifier for the record.

spot_id LINK	Which spot this is about.

date	When the observation was made.

observer	Who made it (may differ from the steward).

notes	What's blooming, what was planted or removed, condition, work done.

photo_urls	Links to photos for this visit (see "Where the photos live").

inaturalist_obs_url	Link to any species observations logged on iNaturalist.

Table 4 · Stewards

Stewards

— one row per person or group

steward_id KEY	Unique identifier.

slug	URL-friendly identifier derived from name (e.g. "vine-squad"), auto-suffixed on collision. Name itself isn't required to be unique -- two unrelated groups in different towns can share one.

name	Person or organization.

type	Individual · School · Club · Nonprofit · Municipality.

contact	Email or phone (kept private; not shown on the public map).

public_display	Yes / No — whether the steward wants to be named publicly.
