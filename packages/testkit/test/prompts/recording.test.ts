import { ProblemError, recordExtension } from '@kvman/kernel';
import type { Manifest } from '@kvman/protocol';
import { defineExtension, z, type Ext } from '@kvman/sdk';
import { describe, expect, it } from 'vitest';
import asker from './fixtures/extensions/asker/extension.ts';

const correlationId = '01JAZ3K4M5N6P7Q8R9S0T1V2W3';

const options = { packageName: '@acme/asker', version: '1.0.0', correlationId };

function recorded(): Manifest {
  return recordExtension(asker, options).manifest;
}

function accessOf(manifest: Manifest, type: string): string {
  const entry = manifest.types.find((candidate) => candidate.type === type);
  if (entry !== undefined && (entry.kind === 'command' || entry.kind === 'query')) return entry.access;
  throw new Error(`expected a command or query ${type} in the manifest`);
}

function deliveryOf(manifest: Manifest, type: string): string {
  const entry = manifest.types.find((candidate) => candidate.type === type);
  if (entry !== undefined && entry.kind === 'event') return entry.delivery;
  throw new Error(`expected an event ${type} in the manifest`);
}

function recordingProblem(setup: (ext: Ext) => void): { code: string; paths: string[] } {
  const definition = defineExtension(
    { name: '@acme/asker', namespace: 'asker', title: 'Test', description: 'A prompt fixture that fails recording.' },
    setup,
  );
  try {
    recordExtension(definition, options);
  } catch (error) {
    if (error instanceof ProblemError) {
      return { code: error.problem.code, paths: (error.problem.issues ?? []).map((issue) => issue.path) };
    }
    throw error;
  }
  throw new Error('the recording was expected to fail');
}

const questionData = { topic: z.string().min(1), text: z.string().min(1) };
const questionAnswer = { answer: z.string().min(1) };

describe('prompts: recording (ADR 0167)', { timeout: 60_000 }, () => {
  it('M2.13-E35 recording Asker derives its collections, queries, commands, events, and BUSY error', () => {
    const manifest = recorded();
    expect(manifest.data.collections.map((collection) => collection.name).sort()).toEqual(['questions', 'tool-calls']);
    for (const name of ['questions', 'tool-calls']) {
      const collection = manifest.data.collections.find((candidate) => candidate.name === name);
      expect(collection).toMatchObject({ indexes: [['status', 'openedAt'], ['openKey']] });
    }
    expect(accessOf(manifest, 'asker.questions.list')).toBe('all');
    expect(accessOf(manifest, 'asker.tool-calls.list')).toBe('all');
    expect(accessOf(manifest, 'asker.question.answer')).toBe('user');
    expect(accessOf(manifest, 'asker.question.reject')).toBe('user');
    expect(accessOf(manifest, 'asker.question.expire')).toBe('internal');
    expect(accessOf(manifest, 'asker.tool-call.answer')).toBe('user');
    expect(accessOf(manifest, 'asker.tool-call.reject')).toBe('user');
    expect(accessOf(manifest, 'asker.tool-call.expire')).toBe('internal');
    expect(deliveryOf(manifest, 'asker.question.asked')).toBe('durable');
    expect(deliveryOf(manifest, 'asker.question.closed')).toBe('durable');
    expect(deliveryOf(manifest, 'asker.tool-call.asked')).toBe('durable');
    expect(deliveryOf(manifest, 'asker.tool-call.closed')).toBe('durable');
    expect(manifest.errors.map((error) => error.code)).toEqual(['asker/BUSY']);
    expect(manifest.types.find((entry) => entry.type === 'asker.tool-call.answer'))
      .toMatchObject({ kind: 'command', input: { properties: { toolCallId: {}, allow: {} } } });
    expect(manifest.types.find((entry) => entry.type === 'asker.tool-call.reject'))
      .toMatchObject({ kind: 'command', input: { properties: { toolCallId: {} } } });
  });

  it('M2.13-E36 a non-object data schema, a name outside the namespace, and duplicate pieces fail recording at their paths', () => {
    {
      // a non-object data schema fails recording at the prompt
      const failed = recordingProblem((ext) => {
        Reflect.apply(ext.registerPrompt, ext, ['asker.question', {
          description: 'A question waiting for the person to answer it.',
          data: z.string(),
          answer: z.object(questionAnswer),
        }]);
      });
      expect(failed.code).toBe('EXT_MANIFEST_INVALID');
      expect(failed.paths).toContain('types.0');
    }
    {
      // a prompt name outside the namespace fails recording at its derived types
      const failed = recordingProblem((ext) => {
        ext.registerPrompt('other.question', {
          description: 'A question waiting for the person to answer it.',
          data: z.object(questionData),
          answer: z.object(questionAnswer),
        });
      });
      expect(failed.code).toBe('EXT_MANIFEST_INVALID');
      expect(failed.paths).toContain('types.0.type');
    }
    {
      // an answer command beside the prompt fails recording at the duplicate
      const failed = recordingProblem((ext) => {
        ext.registerPrompt('asker.question', {
          description: 'A question waiting for the person to answer it.',
          data: z.object(questionData),
          answer: z.object(questionAnswer),
        });
        ext.registerCommand('asker.question.answer', {
          description: 'Answers an open question.',
          input: z.object({}),
          handle: async () => ({}),
        });
      });
      expect(failed.code).toBe('EXT_MANIFEST_INVALID');
      expect(failed.paths).toContain('types.6.type');
    }
    {
      // a BUSY error beside a oneOpenPer prompt fails recording at the duplicate
      const failed = recordingProblem((ext) => {
        ext.registerPrompt('asker.question', {
          description: 'A question waiting for the person to answer it.',
          data: z.object(questionData),
          answer: z.object(questionAnswer),
          oneOpenPer: (data) => `topic:${data.topic}`,
        });
        ext.registerError('asker/BUSY', { description: 'Another question is still open.', title: 'Another question is already open' });
      });
      expect(failed.code).toBe('EXT_MANIFEST_INVALID');
      expect(failed.paths).toContain('errors.1.code');
    }
  });
});
