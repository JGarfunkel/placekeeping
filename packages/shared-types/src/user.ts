import { z } from "zod";

// Matches iNaturalist's own handle rules closely; kept here rather than as a
// DB CHECK constraint, same convention as vegetation/weedLevel in schema.ts.
// No periods -- deliberately excluded so a username can't be confused with a
// domain/email fragment.
export const usernameSchema = z
  .string()
  .min(3)
  .max(40)
  .regex(
    /^[a-zA-Z0-9_-]+$/,
    "Username can only contain letters, numbers, underscores, and hyphens",
  );

export const userSchema = z.object({
  userId: z.string().uuid(),
  name: z.string().min(1),
  username: usernameSchema,
  email: z.string().nullable(),
  isSystemAdmin: z.boolean(),
  // Verification/standing tier -- see LEVEL_LABELS in enums.ts (-1
  // suspended, 0 unverified, 1 verified member, 2 partner). 0 is the
  // default for a freshly created account; not settable via updateUserProfile
  // or any other self-service path, only db:set-level (see schema.ts).
  level: z.number().int().min(-1),
  // Either our own storage URL (uploaded via POST /api/photos) or a pasted
  // external URL -- see photoUrl in schema.ts.
  photoUrl: z.string().url().nullable(),
  createdAt: z.string().datetime(),
});
export type User = z.infer<typeof userSchema>;

export const updateUserProfileSchema = z.object({
  username: usernameSchema.optional(),
  photoUrl: z.string().url().nullable().optional(),
});
export type UpdateUserProfileInput = z.infer<typeof updateUserProfileSchema>;
