import type { KernelErrorCode, Message, Problem } from '@kvman/protocol';
import { kernelProblem, type ProblemContext } from '../problems.ts';

type PayloadSchema<T> = { safeParse(value: unknown): { success: true; data: T } | { success: false; error: { issues: ReadonlyArray<{ path: PropertyKey[]; message: string }> } } };

export type Parsed<T> = { ok: true; value: T } | { ok: false; problem: Problem };

// A payload JSON Schema admitted can still fail a refinement, like a source's form (02 §2.6, M2.1-H3).
export function parsed<T>(schema: PayloadSchema<T>, message: Message): Parsed<T> {
  const result = schema.safeParse(message.payload);
  if (result.success) return { ok: true, value: result.data };
  const issues = result.error.issues.map((issue) => ({ path: issue.path.map(String).join('.'), message: issue.message }));
  return { ok: false, problem: kernelProblem('VALIDATION_FAILED', { correlationId: message.correlationId, messageId: message.id, detail: issues[0]?.message ?? 'the payload is not valid', issues }) };
}

// A kernel command's refusal, attributed to its message.
export function refusal(message: Message, code: KernelErrorCode, context: Omit<ProblemContext, 'correlationId' | 'messageId'>): Problem {
  return kernelProblem(code, { correlationId: message.correlationId, messageId: message.id, ...context });
}
