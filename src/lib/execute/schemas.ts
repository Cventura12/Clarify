import { z } from "zod";

export const DraftEmailSchema = z.object({
  subject: z.string().min(1).max(140),
  body: z.string().min(1).max(5000),
  tone: z.enum(["formal", "professional", "friendly", "direct"]).optional(),
  assumptions: z.array(z.string()),
  needsUserInput: z.array(z.string()),
});

export type DraftEmail = z.infer<typeof DraftEmailSchema>;