import { z } from '@kvman/sdk';
import type { CheckedFinding } from './finding.ts';

// Public input fields with no description (ADR 0009, 116): forms label a field with its description, and kvcoder's
// connector `-h` shows it, so each top-level field of a public command's or query's input needs one.

export type Registration = { name: string; public: boolean; input: unknown };

const objectSchema = z.object({ properties: z.record(z.string(), z.object({ description: z.string().optional() }).loose()) }).loose();

export function fieldFindings(registrations: readonly Registration[]): CheckedFinding[] {
  return registrations
    .filter((registration) => registration.public)
    .flatMap((registration) => {
      const parsed = objectSchema.safeParse(registration.input);
      if (!parsed.success) return [];
      return Object.entries(parsed.data.properties)
        .filter(([, field]) => field.description === undefined)
        .map(([field]) => ({
          message: `The input field ${field} of ${registration.name} has no description.`,
          hint: `Add .describe('…') to ${field}: forms label the field with it, and connector -h shows it.`,
          warning: false,
        }));
    });
}
