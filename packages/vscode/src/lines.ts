import { z } from 'zod';

// The lines `kvman --pipe` writes (plan 14 §14.2), each read into a typed shape; anything else is unreadable.

const versionSchema = z.object({ name: z.string(), version: z.string(), source: z.string() });
const problemSchema = z.object({ code: z.string(), message: z.string(), params: z.record(z.string(), z.unknown()).optional() });

const lineSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('trust'), language: z.string(), versions: z.array(versionSchema) }),
  z.object({ kind: z.literal('running'), url: z.string(), port: z.number().int() }),
  z.object({ kind: z.literal('joined'), url: z.string(), port: z.number().int() }),
  z.object({ kind: z.literal('restarting') }),
  z.object({ kind: z.literal('failed'), language: z.string().optional(), problem: problemSchema }),
]);

export type Line = z.infer<typeof lineSchema>;
export type TrustVersion = z.infer<typeof versionSchema>;
export type LineProblem = z.infer<typeof problemSchema>;

/** One line of kvman's output as its typed shape, or undefined when it is no line kvman writes. */
export function readLine(text: string): Line | undefined {
  try {
    return lineSchema.safeParse(JSON.parse(text)).data;
  } catch (error) {
    if (error instanceof SyntaxError) return undefined;
    throw error;
  }
}

/** The answer to a `trust` line. */
export function trustAnswer(accepted: boolean): string {
  return JSON.stringify({ trust: accepted });
}
