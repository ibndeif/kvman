import { z } from '@kvman/sdk';

// A chat's execution map as it is stored (plan 08 §8.5, ADR 0064): the goal, the steps with what each waits on and
// how far it is, and the findings noted for later. `sessionId` is the chat's own id.

export const mapStatuses = ['todo', 'doing', 'done', 'failed', 'skipped'] as const;

export const mapStepSchema = z.object({
  id: z.string(),
  title: z.string(),
  // A step not yet detailed, or stored before ADR 0072, has none.
  details: z.string().nullable().default(null),
  after: z.array(z.string()),
  uses: z.string().nullable(),
  check: z.string(),
  status: z.enum(mapStatuses),
  evidence: z.string().nullable(),
  note: z.string().nullable(),
});

// A step stored before ADR 0086 has its details as `description`; it is read as `details`, and the next save writes that.
function storedStep(value: unknown): unknown {
  if (typeof value !== 'object' || value === null || !('description' in value) || 'details' in value) return value;
  const { description, ...rest } = value;
  return { ...rest, details: description };
}

export const mapNoteSchema = z.object({ text: z.string(), createdAt: z.string() });

export const mapDocSchema = z.object({
  sessionId: z.string(),
  goal: z.string(),
  steps: z.array(z.preprocess(storedStep, mapStepSchema)),
  notes: z.array(mapNoteSchema),
  version: z.number().int().min(1),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export type MapStatus = (typeof mapStatuses)[number];
export type MapStep = z.output<typeof mapStepSchema>;
export type MapDoc = z.output<typeof mapDocSchema>;
