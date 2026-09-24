import { ProblemError, recordExtension, type ExtensionRecording } from '@kvman/kernel';
import type { Issue, Problem } from '@kvman/protocol';
import { defineExtension, type Ext } from '@kvman/sdk';

export const correlationId = '01JAZ3K4M5N6P7Q8R9S0T1V2W3';

export function record(setup: (ext: Ext) => void, namespace = 'pdf'): ExtensionRecording {
  const definition = defineExtension({ name: `@acme/${namespace}`, namespace, title: 'Test', description: 'A test extension.' }, setup);
  return recordExtension(definition, { version: '1.0.0', correlationId });
}

export function recordingProblem(setup: (ext: Ext) => void, namespace = 'pdf'): Problem {
  try {
    record(setup, namespace);
  } catch (error) {
    if (error instanceof ProblemError) return error.problem;
    throw error;
  }
  throw new Error('the recording was expected to fail');
}

export function issuePaths(problem: Problem): string[] {
  return (problem.issues ?? []).map((issue: Issue) => issue.path);
}

