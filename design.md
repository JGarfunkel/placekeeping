The data model

Four tables:

A Place is a place — mostly stable facts (where, how big, who owns it).

An Observation is a moment — what was seen or done on a given visit. One place collects many observations over the years, so the inventory becomes a history, not just a snapshot.

A Steward is a person or group. Keeping them separate means one steward can care for several places, stewardship can change hands, and people get credited and contacted.

Photos live outside the database (in Google Photos, Drive, S3, or iNaturalist) and are referenced by link — so the inventory never bloats with image files.

PLACES ──────┐

            │ one place has many

            ▼

       OBSERVATIONS ──── PHOTOS (links to external storage)

            

PLACES ──── STEWARDS  (a steward cares for one or more places)

Table 1 · Places

Places

— one row per managed area

place_id KEY	Unique identifier for the place.

name	Common name (e.g., "Roaring Brook School Pollinator Garden").

latitude / longitude	The single most important field for mapping — captured by dropping a pin or using a phone's GPS.

address	Street address or nearest cross streets.

parcel_id	Tax map / parcel number where known — links the record to the municipal tax roll and GIS.

municipality / county	For grouping and county-level coordination.

size_sqft	Approximate area in square feet.

whole_lot	Yes / No — is this the entire lot or only part of it?

legal_owner	Who holds title (town, school district, HOA, private owner, land trust).

accessibility	Pick list: Public · Designated members & guests (school, private club).

place_type	Multi-select (a place can be several): Vegetable/herb · Ornamental · Pollinator · Wild area.

nonnative_strategy	Short description of how non-native / invasive plants are managed.

educational_component	Yes / No + notes — signage, school programs, volunteer days, tours.

steward_id LINK	Points to the Stewards table.

photo_album_url	Link to the place's photo collection.

inaturalist_url	Link to the iNaturalist place or project for species records.

date_added / last_verified	Keeps the inventory honest about how fresh each entry is.

Table 2 · Observations

Observations

— one row per visit or update

observation_id KEY	Unique identifier for the record.

place_id LINK	Which place this is about.

date	When the observation was made.

observer	Who made it (may differ from the steward).

notes	What's blooming, what was planted or removed, condition, work done.

photo_urls	Links to photos for this visit (see "Where the photos live").

inaturalist_obs_url	Link to any species observations logged on iNaturalist.

Table 3 · Stewards

Stewards

— one row per person or group

steward_id KEY	Unique identifier.

name	Person or organization.

type	Individual · School · Club · Nonprofit · Municipality.

contact	Email or phone (kept private; not shown on the public map).

public_display	Yes / No — whether the steward wants to be named publicly.