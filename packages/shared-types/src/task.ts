import { z } from "zod";

export const taskStatusSchema = z.enum(["open", "in_progress", "done", "dropped"]);
export type TaskStatusValue = z.infer<typeof taskStatusSchema>;

export const taskProviderKindSchema = z.enum(["native", "asana"]);

export const taskTargetSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("site"), siteId: z.number().int().positive() }),
  z.object({ type: z.literal("spot"), spotId: z.number().int().positive() }),
  z.object({ type: z.literal("observation"), observationId: z.string().uuid() }),
  z.object({ type: z.literal("event"), eventId: z.string().uuid() }),
]);

const dueOn = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD");

// Plain text only, like event text: no links.
const noLinks = (s: string) => !/https?:\/\/|www\./i.test(s);

export const createTaskSchema = z.object({
  target: taskTargetSchema,
  title: z.string().trim().min(1).max(200).refine(noLinks, "No links in titles"),
  description: z.string().trim().max(10000).default(""),
  dueOn: dueOn.nullable().default(null),
  assigneeUserId: z.string().uuid().nullable().default(null),
  // The observation that prompted the task (create-from-observation).
  observationId: z.string().uuid().nullable().default(null),
  photoUrl: z.string().url().nullable().default(null),
});
export type CreateTaskBody = z.infer<typeof createTaskSchema>;

export const updateTaskSchema = z
  .object({
    title: z.string().trim().min(1).max(200).refine(noLinks, "No links in titles"),
    description: z.string().trim().max(10000),
    status: taskStatusSchema,
    dueOn: dueOn.nullable(),
    assigneeUserId: z.string().uuid().nullable(),
  })
  .partial();
export type UpdateTaskBody = z.infer<typeof updateTaskSchema>;

export const taskCommentSchema = z.object({
  text: z.string().trim().min(1).max(5000),
});
