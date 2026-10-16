import { z } from "zod";

// Phase 1 types only. `control` and `planting` arrive with their gates
// (work_authorization, method tiers, dig-safe, aftercare); until then there
// must be no path to creating one. Adding a type later needs no migration.
export const careEventTypeSchema = z.enum(["cleanup", "other"]);
export type CareEventType = z.infer<typeof careEventTypeSchema>;

export const careEventStatusSchema = z.enum(["planned", "held", "canceled"]);
export type CareEventStatus = z.infer<typeof careEventStatusSchema>;

export const careEventVisibilitySchema = z.enum(["managers", "members", "public"]);
export type CareEventVisibility = z.infer<typeof careEventVisibilitySchema>;

const isoDateTime = z.string().datetime({ offset: true });

const timeZoneSchema = z.string().refine(
  (tz) => {
    try {
      new Intl.DateTimeFormat("en-US", { timeZone: tz });
      return true;
    } catch {
      return false;
    }
  },
  { message: "Invalid IANA time zone" },
);

// "HHMM-HHMM", 24-hour, in the event's local time zone, e.g. "0900-1100".
// The end must be after the start (no overnight slots).
export const timeslotSchema = z
  .string()
  .regex(/^([01]\d|2[0-3])[0-5]\d-([01]\d|2[0-3])[0-5]\d$/, "Use HHMM-HHMM, e.g. 0900-1100")
  .refine((v) => parseTimeslot(v)!.start < parseTimeslot(v)!.end, {
    message: "The end must be after the start",
  });

/** Minutes after midnight for each end of a "HHMM-HHMM" slot, or null. */
export function parseTimeslot(value: string): { start: number; end: number } | null {
  const m = /^(\d{2})(\d{2})-(\d{2})(\d{2})$/.exec(value);
  if (!m) return null;
  return {
    start: Number(m[1]) * 60 + Number(m[2]),
    end: Number(m[3]) * 60 + Number(m[4]),
  };
}

/** "0900-1100" -> "9:00 AM to 11:00 AM". */
export function formatTimeslot(value: string): string {
  const slot = parseTimeslot(value);
  if (!slot) return value;
  const fmt = (mins: number) => {
    const h = Math.floor(mins / 60);
    const mm = String(mins % 60).padStart(2, "0");
    return `${((h + 11) % 12) + 1}:${mm} ${h < 12 ? "AM" : "PM"}`;
  };
  return `${fmt(slot.start)} to ${fmt(slot.end)}`;
}

// An outside link: http(s) only, so no javascript:/data: URLs.
export const outsideUrlSchema = z
  .string()
  .trim()
  .max(500)
  .url()
  .refine((v) => /^https?:\/\//i.test(v), "Use an http or https link");

// Titles and descriptions are plain text with no links (abuse control).
const noLinks = (s: string) => !/https?:\/\/|www\./i.test(s);

export const createCareEventSchema = z
  .object({
    siteId: z.number().int().positive().optional(),
    spotId: z.number().int().positive().optional(),
    title: z.string().trim().min(1).max(120).refine(noLinks, "No links in titles"),
    description: z.string().trim().max(4000).refine(noLinks, "No links").default(""),
    eventType: careEventTypeSchema.default("cleanup"),
    startAt: isoDateTime,
    endAt: isoDateTime,
    timeZone: timeZoneSchema,
    locationText: z.string().trim().max(300).default(""),
    url: outsideUrlSchema.nullable().default(null),
    visibility: careEventVisibilitySchema.default("public"),
    signupOpen: z.boolean().default(true),
    signupDeadline: isoDateTime.nullable().optional(),
    whatToBring: z.string().trim().max(1000).default(""),
    notesForVolunteers: z.string().trim().max(2000).default(""),
  })
  .refine((v) => (v.siteId === undefined) !== (v.spotId === undefined), {
    message: "Provide exactly one of siteId or spotId",
  })
  .refine((v) => new Date(v.endAt) > new Date(v.startAt), {
    message: "endAt must be after startAt",
    path: ["endAt"],
  });
export type CreateCareEventInput = z.infer<typeof createCareEventSchema>;

// eventType is immutable after creation: changing it would change which
// gates apply. Target is immutable too.
export const updateCareEventSchema = z
  .object({
    title: z.string().trim().min(1).max(120).refine(noLinks, "No links in titles"),
    description: z.string().trim().max(4000).refine(noLinks, "No links"),
    startAt: isoDateTime,
    endAt: isoDateTime,
    timeZone: timeZoneSchema,
    locationText: z.string().trim().max(300),
    url: outsideUrlSchema.nullable(),
    visibility: careEventVisibilitySchema,
    signupOpen: z.boolean(),
    signupDeadline: isoDateTime.nullable(),
    whatToBring: z.string().trim().max(1000),
    notesForVolunteers: z.string().trim().max(2000),
  })
  .partial();
export type UpdateCareEventInput = z.infer<typeof updateCareEventSchema>;

export const cancelCareEventSchema = z.object({
  reason: z.string().trim().min(1).max(500),
});

export const guestSignupSchema = z.object({
  name: z.string().trim().min(1).max(80),
  email: z.string().trim().toLowerCase().email().max(254),
  timeslot: timeslotSchema.nullable().default(null),
});

// Body for signing up, or changing your time slot: null = the whole event.
export const signupSchema = z.object({
  timeslot: timeslotSchema.nullable().default(null),
});
