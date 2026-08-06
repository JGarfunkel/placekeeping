import { z } from "zod";
import { stewardMemberRoleSchema } from "./enums";

export const stewardMemberSchema = z.object({
  userId: z.string().uuid(),
  name: z.string(),
  email: z.string().nullable(),
  role: stewardMemberRoleSchema,
  createdAt: z.string().datetime(),
});
export type StewardMember = z.infer<typeof stewardMemberSchema>;

export const addStewardMemberSchema = z.object({
  email: z.string().email(),
  role: stewardMemberRoleSchema.optional(),
});
export type AddStewardMemberInput = z.infer<typeof addStewardMemberSchema>;

export const updateStewardMemberRoleSchema = z.object({
  role: stewardMemberRoleSchema,
});
export type UpdateStewardMemberRoleInput = z.infer<
  typeof updateStewardMemberRoleSchema
>;
