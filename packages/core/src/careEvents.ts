import {
  careEventParticipants,
  careEvents,
  db,
  sites,
  spots,
  users,
} from "@placekeeping/db";
import {
  deriveAccessibility,
  parseTimeslot,
  type CareEventStatus,
  type CareEventVisibility,
  type CreateCareEventInput,
  type UpdateCareEventInput,
} from "@placekeeping/shared-types";
import { and, asc, count, eq, gt, isNotNull, isNull, lt, sql } from "drizzle-orm";
import { createHash, randomBytes } from "node:crypto";
import {
  canManageEvent,
  isSuspended,
  type AuthContext,
  type CareEventTarget,
} from "./auth";
import {
  sendCareEventCanceledEmail,
  sendCareEventConfirmationEmail,
  sendCareEventReminderEmail,
  sendCareEventSignInEmail,
  sendCareEventSignupEmail,
  type CareEventEmailDetails,
} from "./email";
import { diffFields, logEvent, snapshotToChanges } from "./events";
import { adminAuth } from "./firebase-admin";
import { logRemoteCall } from "./remoteLog";
import { DAY_MS, enforceRateLimit, HOUR_MS, purgeRateLimits, rateLimitSubject } from "./rateLimit";
import { getOrCreateUserByFirebaseUid } from "./users";

// Scheduled maintenance events ("workdays") and volunteer sign-up. Named
// care_events because `events` is the audit log. Every write logs a
// "care_event" audit entry in the same transaction. Phase 1 only: control
// and planting events (and their gates) are not creatable yet -- see
// careEventTypeSchema.

export class CareEventError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
    this.name = "CareEventError";
  }
}

const UNCONFIRMED_TTL_MS = 48 * 60 * 60 * 1000;
const REMINDER_WINDOW_MS = 24 * 60 * 60 * 1000;

export type CareEventRow = typeof careEvents.$inferSelect;

function appBaseUrl() {
  return process.env.APP_BASE_URL ?? "http://localhost:3000";
}

export function careEventUrl(eventId: string) {
  return `${appBaseUrl()}/events/${eventId}`;
}

function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

// ---- targets and permissions ------------------------------------------------

export async function loadManageTarget(
  event: Pick<CareEventRow, "siteId" | "spotId">,
): Promise<CareEventTarget | null> {
  if (event.spotId != null) {
    const [spot] = await db
      .select({ stewardId: spots.stewardId, createdByUserId: spots.createdByUserId })
      .from(spots)
      .where(eq(spots.spotId, event.spotId))
      .limit(1);
    return spot ? { type: "spot", spot } : null;
  }
  if (event.siteId != null) {
    const [site] = await db
      .select({ createdBy: sites.createdBy })
      .from(sites)
      .where(eq(sites.siteId, event.siteId))
      .limit(1);
    if (!site) return null;
    const siteSpots = await db
      .select({ stewardId: spots.stewardId, createdByUserId: spots.createdByUserId })
      .from(spots)
      .where(eq(spots.siteId, event.siteId));
    return { type: "site", site, spots: siteSpots };
  }
  return null;
}

export async function canManageCareEvent(
  auth: AuthContext | null,
  event: Pick<CareEventRow, "siteId" | "spotId">,
): Promise<boolean> {
  if (!auth) return false;
  const target = await loadManageTarget(event);
  return target ? canManageEvent(auth, target) : false;
}

// Address/access limits the event inherits from its target: a spot that isn't
// publicly accessible or hides its address forces members-only visibility and
// shows the exact location only to confirmed participants and managers.
async function targetIsRestricted(
  event: Pick<CareEventRow, "siteId" | "spotId">,
): Promise<boolean> {
  if (event.spotId == null) return false;
  const [spot] = await db
    .select({ access: spots.access, addressVisibility: spots.addressVisibility })
    .from(spots)
    .where(eq(spots.spotId, event.spotId))
    .limit(1);
  if (!spot) return false;
  return (
    deriveAccessibility(spot.access) === "designated_members_guests" ||
    spot.addressVisibility === "hidden"
  );
}

// ---- calendar / email details -------------------------------------------------

function icsEscape(value: string) {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r?\n/g, "\\n");
}

function icsStamp(d: Date) {
  return d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}

export function buildIcs(event: CareEventRow, location: string): string {
  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Placekeeping//Care events//EN",
    "BEGIN:VEVENT",
    `UID:${event.id}@placekeeping`,
    `DTSTAMP:${icsStamp(new Date())}`,
    `DTSTART:${icsStamp(event.startAt)}`,
    `DTEND:${icsStamp(event.endAt)}`,
    `SUMMARY:${icsEscape(event.title)}`,
    `DESCRIPTION:${icsEscape(
      [event.description, event.url, careEventUrl(event.id)].filter(Boolean).join("\n"),
    )}`,
    location ? `LOCATION:${icsEscape(location)}` : "",
    `STATUS:${event.status === "canceled" ? "CANCELLED" : "CONFIRMED"}`,
    `URL:${careEventUrl(event.id)}`,
    "END:VEVENT",
    "END:VCALENDAR",
  ]
    .filter(Boolean)
    .join("\r\n");
}

function emailDetails(event: CareEventRow): CareEventEmailDetails {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: event.timeZone,
    dateStyle: "full",
    timeStyle: "short",
  });
  const endFmt = new Intl.DateTimeFormat("en-US", {
    timeZone: event.timeZone,
    timeStyle: "short",
  });
  return {
    title: event.title,
    whenText: `${fmt.format(event.startAt)} to ${endFmt.format(event.endAt)} (${event.timeZone})`,
    locationText: event.locationText,
    whatToBring: event.whatToBring,
    notesForVolunteers: event.notesForVolunteers,
    eventUrl: careEventUrl(event.id),
    // Emails only go to confirmed participants, so the exact location is fine.
    ics: buildIcs(event, event.locationText),
  };
}

// ---- reads ---------------------------------------------------------------------

export async function getCareEvent(id: string): Promise<CareEventRow | null> {
  const [row] = await db.select().from(careEvents).where(eq(careEvents.id, id)).limit(1);
  return row ?? null;
}

type ParticipantRow = typeof careEventParticipants.$inferSelect;

async function getParticipant(
  eventId: string,
  userId: string,
): Promise<ParticipantRow | null> {
  const [row] = await db
    .select()
    .from(careEventParticipants)
    .where(
      and(
        eq(careEventParticipants.eventId, eventId),
        eq(careEventParticipants.userId, userId),
      ),
    )
    .limit(1);
  return row ?? null;
}

export interface CareEventView {
  event: Omit<CareEventRow, "locationText" | "createdBy"> & {
    // Null when the viewer isn't allowed the exact location.
    locationText: string | null;
  };
  headcount: number;
  canManage: boolean;
  myParticipation: { status: string; confirmed: boolean; timeslot: string | null } | null;
  // Usernames of confirmed participants; only for members and managers.
  roster:
    | { userId: string; username: string; role: string; status: string; timeslot: string | null }[]
    | null;
}

function visibleTo(
  visibility: CareEventVisibility,
  auth: AuthContext | null,
  isManager: boolean,
): boolean {
  if (isManager) return true;
  if (visibility === "public") return true;
  if (visibility === "members") return !!auth && !isSuspended(auth);
  return false;
}

// Returns null when the viewer may not see the event at all (callers should
// 404, not 403, so private events don't leak existence).
export async function getCareEventView(
  id: string,
  auth: AuthContext | null,
): Promise<CareEventView | null> {
  const event = await getCareEvent(id);
  if (!event) return null;
  const isManager = await canManageCareEvent(auth, event);
  if (!visibleTo(event.visibility as CareEventVisibility, auth, isManager)) return null;

  const mine = auth ? await getParticipant(id, auth.userId) : null;
  const confirmedMine = !!mine && mine.confirmedAt !== null && mine.status === "going";
  const restricted = await targetIsRestricted(event);
  const showLocation = !restricted || isManager || confirmedMine;

  const going = and(
    eq(careEventParticipants.eventId, id),
    eq(careEventParticipants.status, "going"),
    isNotNull(careEventParticipants.confirmedAt),
  );
  const [{ value: headcount }] = await db
    .select({ value: count() })
    .from(careEventParticipants)
    .innerJoin(users, eq(users.userId, careEventParticipants.userId))
    .where(and(going, sql`${users.level} <> -1`));

  let roster: CareEventView["roster"] = null;
  if (auth && !isSuspended(auth)) {
    roster = await db
      .select({
        userId: users.userId,
        username: users.username,
        role: careEventParticipants.role,
        status: careEventParticipants.status,
        timeslot: careEventParticipants.timeslot,
      })
      .from(careEventParticipants)
      .innerJoin(users, eq(users.userId, careEventParticipants.userId))
      .where(and(going, sql`${users.level} <> -1`))
      .orderBy(asc(careEventParticipants.createdAt));
  }

  const { locationText, createdBy: _createdBy, ...rest } = event;
  return {
    event: { ...rest, locationText: showLocation ? locationText : null },
    headcount: Number(headcount),
    canManage: isManager,
    myParticipation: mine
      ? { status: mine.status, confirmed: confirmedMine, timeslot: mine.timeslot }
      : null,
    roster,
  };
}

export async function listCareEventsForTarget(
  target: { siteId: number } | { spotId: number },
  auth: AuthContext | null,
  opts: { upcomingOnly?: boolean } = {},
): Promise<CareEventRow[]> {
  const where = "siteId" in target
    ? eq(careEvents.siteId, target.siteId)
    : eq(careEvents.spotId, target.spotId);
  const rows = await db
    .select()
    .from(careEvents)
    .where(
      and(
        where,
        opts.upcomingOnly ? gt(careEvents.endAt, new Date()) : undefined,
      ),
    )
    .orderBy(asc(careEvents.startAt));
  const isManager = await canManageCareEvent(auth, {
    siteId: "siteId" in target ? target.siteId : null,
    spotId: "spotId" in target ? target.spotId : null,
  });
  return rows.filter((r) =>
    visibleTo(r.visibility as CareEventVisibility, auth, isManager),
  );
}

// ---- writes: events -----------------------------------------------------------

export async function createCareEvent(
  auth: AuthContext,
  input: CreateCareEventInput,
): Promise<CareEventRow> {
  if (isSuspended(auth) && !auth.isSystemAdmin) {
    throw new CareEventError(403, "Your account can't create events.");
  }
  await enforceRateLimit("care-event-create", auth.userId, 20, DAY_MS);
  const target = { siteId: input.siteId ?? null, spotId: input.spotId ?? null };
  const loaded = await loadManageTarget(target);
  if (!loaded) throw new CareEventError(404, "Site or spot not found.");
  if (!canManageEvent(auth, loaded)) {
    throw new CareEventError(403, "You can't schedule events here.");
  }

  const restricted = await targetIsRestricted(target);
  const visibility: CareEventVisibility = restricted && input.visibility === "public"
    ? "members"
    : input.visibility;

  return db.transaction(async (tx) => {
    const [created] = await tx
      .insert(careEvents)
      .values({
        ...target,
        title: input.title,
        description: input.description,
        eventType: input.eventType,
        startAt: new Date(input.startAt),
        endAt: new Date(input.endAt),
        timeZone: input.timeZone,
        locationText: input.locationText,
        url: input.url,
        visibility,
        signupOpen: input.signupOpen,
        signupDeadline: input.signupDeadline ? new Date(input.signupDeadline) : null,
        whatToBring: input.whatToBring,
        notesForVolunteers: input.notesForVolunteers,
        createdBy: auth.userId,
      })
      .returning();
    // The organizer is the event's lead, already confirmed.
    await tx.insert(careEventParticipants).values({
      eventId: created.id,
      userId: auth.userId,
      role: "lead",
      confirmedAt: new Date(),
    });
    await logEvent(
      {
        entityType: "care_event",
        entityId: created.id,
        action: "create",
        userId: auth.userId,
        changes: snapshotToChanges(
          {
            title: created.title,
            eventType: created.eventType,
            siteId: created.siteId,
            spotId: created.spotId,
            startAt: created.startAt.toISOString(),
            visibility: created.visibility,
          },
          "create",
        ),
      },
      tx,
    );
    return created;
  });
}

export async function updateCareEvent(
  auth: AuthContext,
  id: string,
  input: UpdateCareEventInput,
): Promise<CareEventRow> {
  const before = await getCareEvent(id);
  if (!before) throw new CareEventError(404, "Event not found.");
  if (!(await canManageCareEvent(auth, before))) {
    throw new CareEventError(403, "You can't edit this event.");
  }
  if (before.status !== "planned") {
    throw new CareEventError(409, "Only planned events can be edited.");
  }

  const startAt = input.startAt ? new Date(input.startAt) : before.startAt;
  const endAt = input.endAt ? new Date(input.endAt) : before.endAt;
  if (endAt <= startAt) throw new CareEventError(400, "End must be after start.");

  let visibility = input.visibility;
  if (visibility === "public" && (await targetIsRestricted(before))) {
    visibility = "members";
  }

  const { startAt: _s, endAt: _e, signupDeadline, ...plain } = input;
  const patch = {
    ...plain,
    ...(visibility ? { visibility } : {}),
    ...(input.startAt ? { startAt } : {}),
    ...(input.endAt ? { endAt } : {}),
    ...(signupDeadline !== undefined
      ? { signupDeadline: signupDeadline ? new Date(signupDeadline) : null }
      : {}),
  };

  return db.transaction(async (tx) => {
    const [after] = await tx
      .update(careEvents)
      .set({ ...patch, updatedAt: new Date() })
      .where(eq(careEvents.id, id))
      .returning();
    const changes = diffFields(
      before as Record<string, unknown>,
      after as Record<string, unknown>,
      patch,
    );
    if (changes) {
      await logEvent(
        {
          entityType: "care_event",
          entityId: id,
          action: "update",
          userId: auth.userId,
          changes,
        },
        tx,
      );
    }
    return after;
  });
}

export async function cancelCareEvent(
  auth: AuthContext,
  id: string,
  reason: string,
): Promise<void> {
  const before = await getCareEvent(id);
  if (!before) throw new CareEventError(404, "Event not found.");
  if (!(await canManageCareEvent(auth, before))) {
    throw new CareEventError(403, "You can't cancel this event.");
  }
  if (before.status === "canceled") return;
  if (before.status === "held") {
    throw new CareEventError(409, "A held event can't be canceled.");
  }

  const after = await db.transaction(async (tx) => {
    const [row] = await tx
      .update(careEvents)
      .set({ status: "canceled" satisfies CareEventStatus, cancelReason: reason, updatedAt: new Date() })
      .where(eq(careEvents.id, id))
      .returning();
    await logEvent(
      {
        entityType: "care_event",
        entityId: id,
        action: "update",
        userId: auth.userId,
        changes: {
          status: { from: before.status, to: "canceled" },
          cancelReason: { from: null, to: reason },
        },
      },
      tx,
    );
    return row;
  });

  const recipients = await db
    .select({ email: users.email })
    .from(careEventParticipants)
    .innerJoin(users, eq(users.userId, careEventParticipants.userId))
    .where(
      and(
        eq(careEventParticipants.eventId, id),
        eq(careEventParticipants.status, "going"),
        isNotNull(careEventParticipants.confirmedAt),
      ),
    );
  const details = emailDetails(after);
  for (const r of recipients) {
    if (!r.email) continue;
    try {
      await sendCareEventCanceledEmail(r.email, details, reason);
    } catch (err) {
      console.error("[careEvents] cancel email failed:", err);
    }
  }
}

// ---- writes: sign-up -----------------------------------------------------------

function assertSignupAllowed(event: CareEventRow, now = new Date()) {
  if (event.status !== "planned") {
    throw new CareEventError(409, "This event isn't open for sign-up.");
  }
  if (!event.signupOpen) throw new CareEventError(409, "Sign-up is closed.");
  if (event.endAt <= now) throw new CareEventError(409, "This event has ended.");
  if (event.signupDeadline && event.signupDeadline <= now) {
    throw new CareEventError(409, "The sign-up deadline has passed.");
  }
}

// A volunteer's slot is normalized "HHMM-HHMM" in the event's own time zone.
// When the event sits within one local day, the slot must fall inside it;
// multi-day events only need a well-formed slot.
function localParts(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "00";
  return {
    day: `${get("year")}-${get("month")}-${get("day")}`,
    minutes: Number(get("hour")) * 60 + Number(get("minute")),
  };
}

function assertTimeslotFits(event: CareEventRow, timeslot: string | null) {
  if (timeslot === null) return;
  const slot = parseTimeslot(timeslot);
  if (!slot) throw new CareEventError(400, "Invalid time slot.");
  const start = localParts(event.startAt, event.timeZone);
  const end = localParts(event.endAt, event.timeZone);
  if (start.day !== end.day) return;
  if (slot.start < start.minutes || slot.end > end.minutes) {
    throw new CareEventError(400, "Your time slot has to fall within the event's hours.");
  }
}

/** One-tap sign-up for a signed-in user. */
export async function signUpForCareEvent(
  auth: AuthContext,
  eventId: string,
  // "HHMM-HHMM" in the event's time zone; null/omitted = the whole event.
  timeslot: string | null = null,
): Promise<void> {
  if (isSuspended(auth)) throw new CareEventError(403, "Your account can't sign up.");
  await enforceRateLimit("care-event-signup", auth.userId, 30, HOUR_MS);
  const event = await getCareEvent(eventId);
  if (!event) throw new CareEventError(404, "Event not found.");
  const isManager = await canManageCareEvent(auth, event);
  if (!visibleTo(event.visibility as CareEventVisibility, auth, isManager)) {
    throw new CareEventError(404, "Event not found.");
  }
  assertSignupAllowed(event);
  assertTimeslotFits(event, timeslot);

  const existing = await getParticipant(eventId, auth.userId);
  if (existing?.status === "going" && existing.confirmedAt) {
    // Already signed up: signing up again just updates the time slot.
    if (existing.timeslot !== timeslot) await setCareEventTimeslot(auth, eventId, timeslot);
    return;
  }

  await db.transaction(async (tx) => {
    await tx
      .insert(careEventParticipants)
      .values({ eventId, userId: auth.userId, confirmedAt: new Date(), timeslot })
      .onConflictDoUpdate({
        target: [careEventParticipants.eventId, careEventParticipants.userId],
        set: {
          status: "going",
          timeslot,
          confirmedAt: existing?.confirmedAt ?? new Date(),
          updatedAt: new Date(),
        },
      });
    await logEvent(
      {
        entityType: "care_event",
        entityId: eventId,
        action: "update",
        userId: auth.userId,
        changes: { participant: { from: null, to: auth.userId } },
      },
      tx,
    );
  });

  const [user] = await db
    .select({ email: users.email })
    .from(users)
    .where(eq(users.userId, auth.userId))
    .limit(1);
  if (user?.email) {
    try {
      await sendCareEventSignupEmail(user.email, emailDetails(event));
    } catch (err) {
      console.error("[careEvents] signup email failed:", err);
    }
  }
}

export async function cancelCareEventSignup(
  auth: AuthContext,
  eventId: string,
): Promise<void> {
  const result = await db
    .update(careEventParticipants)
    .set({ status: "canceled", updatedAt: new Date() })
    .where(
      and(
        eq(careEventParticipants.eventId, eventId),
        eq(careEventParticipants.userId, auth.userId),
        eq(careEventParticipants.status, "going"),
      ),
    )
    .returning({ userId: careEventParticipants.userId });
  if (result.length > 0) {
    await logEvent({
      entityType: "care_event",
      entityId: eventId,
      action: "update",
      userId: auth.userId,
      changes: { participant: { from: auth.userId, to: null } },
    });
  }
}

/** Changes the time slot of your own sign-up (null = the whole event). */
export async function setCareEventTimeslot(
  auth: AuthContext,
  eventId: string,
  timeslot: string | null,
): Promise<void> {
  const event = await getCareEvent(eventId);
  if (!event) throw new CareEventError(404, "Event not found.");
  assertTimeslotFits(event, timeslot);
  const participant = await getParticipant(eventId, auth.userId);
  if (!participant || participant.status !== "going") {
    throw new CareEventError(409, "Sign up for the event first.");
  }
  await db.transaction(async (tx) => {
    await tx
      .update(careEventParticipants)
      .set({ timeslot, updatedAt: new Date() })
      .where(
        and(
          eq(careEventParticipants.eventId, eventId),
          eq(careEventParticipants.userId, auth.userId),
        ),
      );
    await logEvent(
      {
        entityType: "care_event",
        entityId: eventId,
        action: "update",
        userId: auth.userId,
        changes: { timeslot: { from: participant.timeslot, to: timeslot } },
      },
      tx,
    );
  });
}

/**
 * Signed-out sign-up. Always resolves the same way whether or not the email
 * already has an account, so the form can't be used to probe which addresses
 * are registered. A new address gets an unverified account and an unconfirmed
 * roster row; an existing one only gets a "sign in to join" email.
 */
export async function guestSignUpForCareEvent(
  eventId: string,
  guest: { name: string; email: string; timeslot?: string | null },
  // Caller-supplied network address (null when unknown); limited per IP.
  clientIp: string | null,
): Promise<void> {
  // Limits come first so no email is ever sent past them. Per-email also
  // stops this form being used to mail-bomb someone else's address.
  if (clientIp) {
    await enforceRateLimit("care-guest-ip", rateLimitSubject(clientIp), 10, HOUR_MS);
  }
  await enforceRateLimit("care-guest-email", rateLimitSubject(guest.email), 3, HOUR_MS);
  const event = await getCareEvent(eventId);
  // Guests can only join public events.
  if (!event || event.visibility !== "public") {
    throw new CareEventError(404, "Event not found.");
  }
  assertSignupAllowed(event);
  assertTimeslotFits(event, guest.timeslot ?? null);
  const details = emailDetails(event);

  const [existing] = await db
    .select({ userId: users.userId })
    .from(users)
    .where(eq(sql`lower(${users.email})`, guest.email.toLowerCase()))
    .limit(1);
  if (existing) {
    await sendCareEventSignInEmail(guest.email, details);
    return;
  }

  const fbUser = await logRemoteCall("firebase-admin", "createUser", () =>
    adminAuth().createUser({
      email: guest.email,
      password: randomBytes(24).toString("base64url"),
      displayName: guest.name,
      emailVerified: false,
    }),
  ).catch(async (err: { code?: string }) => {
    // Lost a race with another sign-up for the same address: behave as existing.
    if (err?.code === "auth/email-already-exists") return null;
    throw err;
  });
  if (!fbUser) {
    await sendCareEventSignInEmail(guest.email, details);
    return;
  }

  const user = await getOrCreateUserByFirebaseUid({
    firebaseUid: fbUser.uid,
    name: guest.name,
    email: guest.email,
  });
  const token = randomBytes(32).toString("hex");
  await db.insert(careEventParticipants).values({
    eventId,
    userId: user.userId,
    timeslot: guest.timeslot ?? null,
    confirmationTokenHash: hashToken(token),
  });
  await sendCareEventConfirmationEmail(
    guest.email,
    `${appBaseUrl()}/events/${eventId}/confirm?token=${token}`,
    details,
  );
}

/**
 * Consumes the emailed token: confirms the roster row, marks the Firebase
 * email verified, and returns a link where the guest sets their password.
 */
export async function confirmGuestSignup(
  token: string,
): Promise<{ eventId: string; passwordSetupUrl: string | null } | null> {
  const [row] = await db
    .select({ participant: careEventParticipants, email: users.email, firebaseUid: users.firebaseUid })
    .from(careEventParticipants)
    .innerJoin(users, eq(users.userId, careEventParticipants.userId))
    .where(eq(careEventParticipants.confirmationTokenHash, hashToken(token)))
    .limit(1);
  if (!row) return null;
  const { participant } = row;
  if (Date.now() - participant.createdAt.getTime() > UNCONFIRMED_TTL_MS) return null;

  await db.transaction(async (tx) => {
    await tx
      .update(careEventParticipants)
      .set({ confirmedAt: new Date(), confirmationTokenHash: null, updatedAt: new Date() })
      .where(
        and(
          eq(careEventParticipants.eventId, participant.eventId),
          eq(careEventParticipants.userId, participant.userId),
        ),
      );
    await logEvent(
      {
        entityType: "care_event",
        entityId: participant.eventId,
        action: "update",
        userId: participant.userId,
        changes: { participant: { from: null, to: participant.userId } },
      },
      tx,
    );
  });

  let passwordSetupUrl: string | null = null;
  if (row.email && row.firebaseUid) {
    const eventUrl = careEventUrl(participant.eventId);
    await adminAuth().updateUser(row.firebaseUid, { emailVerified: true });
    passwordSetupUrl = await adminAuth().generatePasswordResetLink(row.email, {
      url: eventUrl,
    });
  }
  return { eventId: participant.eventId, passwordSetupUrl };
}

// ---- scheduled maintenance ------------------------------------------------------

/**
 * One scheduler tick: purges unconfirmed sign-ups older than 48h and sends
 * the day-before reminder. Safe to run repeatedly (reminders are stamped).
 */
export async function runCareEventMaintenance(now = new Date()) {
  const purged = await db
    .delete(careEventParticipants)
    .where(
      and(
        isNull(careEventParticipants.confirmedAt),
        lt(careEventParticipants.createdAt, new Date(now.getTime() - UNCONFIRMED_TTL_MS)),
      ),
    )
    .returning({ userId: careEventParticipants.userId });

  const due = await db
    .select({ event: careEvents, participant: careEventParticipants, email: users.email })
    .from(careEventParticipants)
    .innerJoin(careEvents, eq(careEvents.id, careEventParticipants.eventId))
    .innerJoin(users, eq(users.userId, careEventParticipants.userId))
    .where(
      and(
        eq(careEvents.status, "planned"),
        gt(careEvents.startAt, now),
        lt(careEvents.startAt, new Date(now.getTime() + REMINDER_WINDOW_MS)),
        eq(careEventParticipants.status, "going"),
        isNotNull(careEventParticipants.confirmedAt),
        isNull(careEventParticipants.reminderSentAt),
        sql`${users.level} <> -1`,
      ),
    );

  let reminded = 0;
  for (const { event, participant, email } of due) {
    if (!email) continue;
    try {
      await sendCareEventReminderEmail(email, emailDetails(event));
      await db
        .update(careEventParticipants)
        .set({ reminderSentAt: new Date() })
        .where(
          and(
            eq(careEventParticipants.eventId, participant.eventId),
            eq(careEventParticipants.userId, participant.userId),
          ),
        );
      reminded++;
    } catch (err) {
      console.error("[careEvents] reminder failed:", err);
    }
  }
  const limitsPurged = await purgeRateLimits(now);
  return { purged: purged.length, reminded, limitsPurged };
}
