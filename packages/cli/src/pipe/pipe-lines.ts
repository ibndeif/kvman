import type { ExtensionVersion } from '@kvman/kernel';
import { z, type Problem } from '@kvman/sdk';

// The lines of a piped run (plan 14 §14.2): what kvman writes, one JSON object per line, and the one answer it reads.

export type PipeLine =
  | { kind: 'trust'; language: string; versions: ExtensionVersion[] }
  | { kind: 'running'; url: string; port: number }
  | { kind: 'joined'; url: string; port: number }
  | { kind: 'restarting' }
  | { kind: 'failed'; language?: string; problem: Problem };

export function encodeLine(line: PipeLine): string {
  return `${JSON.stringify(line)}\n`;
}

export function trustLine(language: string, versions: readonly ExtensionVersion[]): PipeLine {
  return { kind: 'trust', language, versions: versions.map(({ name, version, source }) => ({ name, version, source })) };
}

// A start that fails before its preset is found has no language (ADR 0038, 18).
export function failedLine(problem: Problem, language: string | undefined): PipeLine {
  return language === undefined ? { kind: 'failed', problem } : { kind: 'failed', language, problem };
}

const answerSchema = z.strictObject({ trust: z.literal(true) });

// Only `{ "trust": true }` accepts; any other line declines (ADR 0038, 20).
export function acceptsTrust(line: string): boolean {
  try {
    return answerSchema.safeParse(JSON.parse(line)).success;
  } catch (error) {
    if (error instanceof SyntaxError) return false;
    throw error;
  }
}
