import { z } from "zod";
import { groupStewardTypeSchema, stewardTypeSchema } from "./enums";

export const stewardSchema = z.object({
  stewardId: z.string().uuid(),
  slug: z.string().min(1),
  name: z.string().min(1),
  type: stewardTypeSchema,
  url: z.string().nullable(),
  // Either our own storage URL (uploaded via POST /api/photos) or a pasted
  // external URL -- see logoUrl in schema.ts.
  logoUrl: z.string().url().nullable(),
  publicDisplay: z.boolean(),
  // Same convention as users.level -- see LEVEL_LABELS in enums.ts.
  // Excluded from updateStewardSchema/createGroupStewardSchema on purpose,
  // since it's set via db:set-level, not self-service (see schema.ts).
  level: z.number().int().min(-1),
  createdAt: z.string().datetime(),
});
export type Steward = z.infer<typeof stewardSchema>;

export const stewardPrivateSchema = stewardSchema.extend({
  contact: z.string().nullable(),
});
export type StewardPrivate = z.infer<typeof stewardPrivateSchema>;

// type is deliberately absent: it's fixed at creation (self-service always
// creates "individual"; only system admins create groups, via
// createGroupStewardSchema below), so there's no PATCH path that changes it.
export const updateStewardSchema = z.object({
  name: z.string().min(1).optional(),
  url: z.string().url().nullable().optional(),
  contact: z.string().nullable().optional(),
  logoUrl: z.string().url().nullable().optional(),
  publicDisplay: z.boolean().optional(),
});
export type UpdateStewardInput = z.infer<typeof updateStewardSchema>;

export const createGroupStewardSchema = z.object({
  name: z.string().min(1),
  type: groupStewardTypeSchema,
  url: z.string().url().nullable().optional(),
  contact: z.string().nullable().optional(),
  publicDisplay: z.boolean().optional(),
});
export type CreateGroupStewardInput = z.infer<typeof createGroupStewardSchema>;

export const stewardOptionSchema = stewardSchema.pick({
  stewardId: true,
  name: true,
});
export type StewardOption = z.infer<typeof stewardOptionSchema>;

export const stewardSearchQuerySchema = z.object({
  q: z.string().min(1),
});
export type StewardSearchQuery = z.infer<typeof stewardSearchQuerySchema>;

// Self-service group creation (any authenticated user, not just system
// admins -- see createGroupStewardSelfService). Unlike createGroupStewardSchema,
// contact is required and must be a real email address, since it's where the
// verification link is sent.
export const createSelfServiceStewardSchema = z.object({
  name: z.string().min(1),
  type: groupStewardTypeSchema,
  url: z.string().url().nullable().optional(),
  contact: z.string().email(),
  publicDisplay: z.boolean().optional(),
});
export type CreateSelfServiceStewardInput = z.infer<
  typeof createSelfServiceStewardSchema
>;

export type StewardCandidate = {
  stewardId: string;
  name: string;
  relationship: "individual" | "admin" | "member";
};
