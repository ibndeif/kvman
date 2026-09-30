import { jsonSchema, type Json } from '@kvman/sdk';
import type { z } from '@kvman/sdk';
import { documentLimitBytes } from '../limits.ts';
import { kernelProblem } from '../problems.ts';

// JSON as the store keeps it: text of at most 16 MiB (plan 02 §2.13).

export function storedText(value: unknown, what: string): string {
  const text = JSON.stringify(value);
  if (Buffer.byteLength(text) > documentLimitBytes) {
    throw kernelProblem('TOO_LARGE', `${what} is over the limit of ${documentLimitBytes} bytes of JSON.`, { limit: documentLimitBytes });
  }
  return text;
}

export function validationFailed(what: string, error: z.ZodError): Error {
  const issues = error.issues.map((issue) => ({ path: issue.path.map(String).join('.'), message: issue.message }));
  return kernelProblem('VALIDATION_FAILED', `${what} is invalid.`, { issues });
}

export function parsedJson(text: string): Json {
  const value: unknown = JSON.parse(text);
  return jsonSchema.parse(value);
}
