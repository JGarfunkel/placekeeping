import { sql } from "drizzle-orm";
import { db } from "./client";
import { observations, spots, stewardMembers, stewards, users } from "./schema";

async function main() {
  console.log("Seeding users...");
  const [aliceUser, bobUser] = await db
    .insert(users)
    .values([
      {
        firebaseUid: "seed-firebase-uid-alice",
        name: "Alice Rivera",
        username: "alice_rivera",
        email: "alice@example.com",
      },
      {
        firebaseUid: "seed-firebase-uid-bob",
        name: "Bob Chen",
        username: "bob_chen",
        email: "bob@example.com",
      },
    ])
    .returning();

  console.log("Seeding stewards...");
  // Alice signed up as an individual steward herself; the school is a group
  // steward with no owning user -- Bob administers it via steward_members.
  const [alice, school] = await db
    .insert(stewards)
    .values([
      {
        userId: aliceUser.userId,
        name: "Alice Rivera",
        slug: "alice-rivera",
        type: "individual",
        contact: "alice@example.com",
        publicDisplay: true,
      },
      {
        name: "Roaring Brook School",
        slug: "roaring-brook-school",
        type: "school",
        url: "https://roaringbrook.example.edu",
        contact: "office@roaringbrook.example.edu",
        publicDisplay: true,
      },
    ])
    .returning();

  await db.insert(stewardMembers).values({
    stewardId: school.stewardId,
    userId: bobUser.userId,
    role: "admin",
  });

  console.log("Seeding spots...");
  const seedSpots: Array<{
    name: string;
    lat: number;
    lng: number;
    stewardId: string | null;
    purpose: (typeof spots.$inferInsert)["purpose"];
    vegetation: (typeof spots.$inferInsert)["vegetation"];
    weedLevel: (typeof spots.$inferInsert)["weedLevel"];
  }> = [
    {
      name: "Roaring Brook School Pollinator Garden",
      lat: 41.7658,
      lng: -72.6734,
      stewardId: school.stewardId,
      purpose: "garden",
      vegetation: "pollinator",
      weedLevel: "minimal",
    },
    {
      name: "Elm Street Community Vegetable Plot",
      lat: 41.7601,
      lng: -72.685,
      stewardId: alice.stewardId,
      purpose: "garden",
      vegetation: "vegetable_herb",
      weedLevel: "minimal",
    },
    {
      name: "Riverside Wild Meadow",
      lat: 41.772,
      lng: -72.669,
      stewardId: null,
      purpose: "wild_area",
      vegetation: "grassland",
      weedLevel: "light",
    },
  ];

  const insertedSpots = [];
  for (const p of seedSpots) {
    const [row] = await db
      .insert(spots)
      .values({
        name: p.name,
        location: sql`ST_SetSRID(ST_MakePoint(${p.lng}, ${p.lat}), 4326)::geography`,
        purpose: p.purpose,
        vegetation: p.vegetation,
        weedLevel: p.weedLevel,
        stewardId: p.stewardId,
        educationalComponent: p.stewardId === school.stewardId,
      })
      .returning();
    insertedSpots.push(row);
  }

  console.log("Seeding an observation...");
  await db.insert(observations).values({
    spotId: insertedSpots[0].spotId,
    observerName: "Alice Rivera",
    observerId: aliceUser.userId,
    notes: "Milkweed and coneflower in bloom; monarch caterpillars spotted.",
    photoUrls: [],
  });

  console.log("Verifying ST_DWithin nearby query (10km around 41.76,-72.68)...");
  const nearby = await db.execute(sql`
    SELECT name, ST_Distance(location, ST_MakePoint(-72.68, 41.76)::geography) AS distance_m
    FROM spots
    WHERE ST_DWithin(location, ST_MakePoint(-72.68, 41.76)::geography, 10000)
    ORDER BY distance_m ASC
  `);
  console.table(nearby.rows);

  console.log("Seed complete.");
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
