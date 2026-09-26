import { manifestSchema } from '@kvman/protocol';
import { z } from '@kvman/sdk';
import { describe, expect, it } from 'vitest';
import { issuePaths, record, recordingProblem } from './harness.ts';

const input = z.object({});
const schema = z.object({ id: z.string() });
const objectDocument = { $schema: 'https://json-schema.org/draft/2020-12/schema', type: 'object', properties: {}, additionalProperties: false };
// Inputs and event payloads are recorded in Zod's input view, where a plain object accepts unknown fields (ADR 0077).
const inputDocument = { $schema: 'https://json-schema.org/draft/2020-12/schema', type: 'object', properties: {} };
const handle = async (): Promise<null> => null;
const up = async (): Promise<void> => undefined;

describe('manifest entries (plan 05 §5.12, ADRs 0013, 0046, 0047)', () => {
  it('M1.3-E3 defaults are written explicitly and absent fields stay absent', () => {
    const { manifest } = record((ext) => {
      ext.registerCommand('pdf.run', { description: 'Runs.', input, handle });
      ext.registerEvent('pdf.ran', { description: 'Ran.' });
      ext.registerError('pdf/FAILED', { description: 'Failed.', title: 'Failed' });
      ext.registerCollection('files', { description: 'Files.', schema });
      ext.registerEntity('pdf.file', { description: 'A file.', title: 'File', schema, display: { title: '$item.id' } });
    });
    expect(manifest.types).toEqual([
      { type: 'pdf.run', kind: 'command', description: 'Runs.', input: inputDocument, access: 'all', handler: 'command:pdf.run' },
      { type: 'pdf.ran', kind: 'event', description: 'Ran.', delivery: 'durable' },
    ]);
    expect(manifest.errors).toEqual([{ code: 'pdf/FAILED', description: 'Failed.', title: 'Failed', retryable: false }]);
    expect(manifest.data).toMatchObject({ version: 1, compatibleWith: [], migrations: [], collections: [{ idField: 'id' }] });
    expect(manifest.entities[0]).toMatchObject({ idField: 'id', display: { title: '$item.id' } });
    expect(Object.keys(manifest.entities[0] ?? {})).not.toContain('route');
    expect(manifest.meta).toEqual({ name: '@acme/pdf', version: '1.0.0', namespace: 'pdf', title: 'Test', description: 'A test extension.', implements: [] });
    expect(manifest.config).toBeNull();
    expect(manifest.permissions).toEqual({ capabilities: [], isolation: null, requireTypes: [], requireComponents: [] });
    expect(JSON.stringify(manifest)).not.toContain('undefined');
  });

  it('M1.3-E4 every optional field is recorded in call order and the manifest parses', () => {
    const { manifest } = record((ext) => {
      ext.requestCapability('calls', { reason: 'Reads files.', types: ['fs.file.get', 'todo.*'] });
      ext.requestIsolation('dedicated', { reason: 'Uses native code.' });
      ext.requireTypes(['fs.file.get'], { reason: 'Reads files.' });
      ext.requireComponents(['fs.picker'], { reason: 'Picks files.' });
      ext.registerCommand('pdf.run', {
        description: 'Runs.', input, output: input, examples: [{}], lane: 'run:{{ $message.id }}', concurrency: 2, timeoutMs: 1000,
        maxAttempts: 5, priority: 'background', retention: '7d', scope: 'global', access: 'all', namingException: 'Legacy name.',
        slash: { name: 'run', description: 'Run it' }, agentTool: { title: 'Run', dangerous: true }, handle: async () => ({}),
      });
      ext.registerQuery('pdf.runs.list', { description: 'Lists.', input, output: input, examples: [{}], timeoutMs: 500, access: 'extensions', agentTool: { title: 'List runs' }, handle: async () => ({}) });
      ext.registerEvent('pdf.run.started', { description: 'Started.', delivery: 'transient', payload: input });
      ext.subscribe('fs.*', { description: 'Watches files.', lane: 'file:{{ $payload.path }}', concurrency: 1, timeoutMs: 2000, handle: async () => undefined });
      ext.registerSchedule('nightly', { description: 'Nightly.', cron: '0 3 * * *', command: 'pdf.run', payload: { id: 'all' } });
      ext.registerLog('history:*', { description: 'History.', entry: z.string() });
      ext.registerError('pdf/BUSY', { description: 'Busy.', title: 'Busy', retryable: true, hint: 'Try again.' });
      ext.registerEntity('pdf.file', {
        description: 'A file.', title: 'File', schema, idField: 'id', display: { title: '$item.id', subtitle: '$item.id', icon: 'file' }, route: '/files/{{ $item.id }}',
      });
      ext.registerConfig({ scope: 'both', schema: z.object({ language: z.string().describe('The language code.') }) });
    });
    expect(manifestSchema.parse(manifest)).toEqual(manifest);
    expect(manifest.permissions).toEqual({
      capabilities: [{ name: 'calls', types: ['fs.file.get', 'todo.*'], reason: 'Reads files.' }],
      isolation: { mode: 'dedicated', reason: 'Uses native code.' },
      requireTypes: [{ types: ['fs.file.get'], reason: 'Reads files.' }],
      requireComponents: [{ components: ['fs.picker'], reason: 'Picks files.' }],
    });
    expect(manifest.types.map((entry) => entry.type)).toEqual(['pdf.run', 'pdf.runs.list', 'pdf.run.started']);
    expect(manifest.types[0]).toMatchObject({ retention: '7d', scope: 'global', access: 'all', slash: { name: 'run' }, agentTool: { dangerous: true }, namingException: 'Legacy name.' });
    expect(manifest.types[1]).toMatchObject({ access: 'extensions', timeoutMs: 500, agentTool: { title: 'List runs' } });
    expect(manifest.types[2]).toMatchObject({ delivery: 'transient', payload: inputDocument });
    expect(manifest.types[0]).toMatchObject({ input: inputDocument, output: objectDocument });
    expect(manifest.subscriptions).toEqual([{ event: 'fs.*', description: 'Watches files.', lane: 'file:{{ $payload.path }}', concurrency: 1, timeoutMs: 2000, handler: 'subscription:fs.*' }]);
    expect(manifest.schedules).toEqual([{ name: 'nightly', description: 'Nightly.', cron: '0 3 * * *', command: 'pdf.run', payload: { id: 'all' } }]);
    expect(manifest.errors[0]).toEqual({ code: 'pdf/BUSY', description: 'Busy.', title: 'Busy', retryable: true, hint: 'Try again.' });
    expect(manifest.entities[0]).toMatchObject({ display: { subtitle: '$item.id', icon: 'file' }, route: '/files/{{ $item.id }}' });
    expect(manifest.config).toMatchObject({ scope: 'both', schema: { required: ['language'] } });
  });

  it('M1.3-E5 subscriptions and migrations are bound by reference; a handle that is not a function fails', () => {
    const subscriber = async (): Promise<void> => undefined;
    const { functions } = record((ext) => {
      ext.subscribe('pdf.imported', { description: 'Reacts.', handle: subscriber });
      ext.registerDataVersion(2, { migrations: [{ to: 2, up }] });
    });
    expect(functions.get('subscription:pdf.imported')).toBe(subscriber);
    expect(functions.get('migration:2')).toBe(up);
    const notAFunction: unknown = 'handler';
    const problem = recordingProblem((ext) => {
      Reflect.apply(ext.registerCommand, ext, ['pdf.run', { description: 'Runs.', input, handle: notAFunction }]);
    });
    expect(problem.issues).toEqual([{ path: 'types.0.handler', message: 'expected a function', hint: 'pass an async function as handle' }]);
  });

  it('M1.3-E6 migrations cover every version step once; compatible versions are lower', () => {
    const { manifest } = record((ext) => {
      ext.registerDataVersion(3, { migrations: [{ to: 2, up }, { to: 3, up }], compatibleWith: [2] });
    });
    expect(manifest.data).toMatchObject({ version: 3, compatibleWith: [2], migrations: [{ to: 2, handler: 'migration:2' }, { to: 3, handler: 'migration:3' }] });
    const failing = (migrations: Array<{ to: number; up: typeof up }>, compatibleWith: number[] = []) => issuePaths(recordingProblem((ext) => {
      ext.registerDataVersion(3, { migrations, compatibleWith });
    }));
    expect(failing([{ to: 3, up }])).toEqual(['data.migrations']);
    expect(failing([{ to: 2, up }, { to: 2, up }, { to: 3, up }])).toEqual(['data.migrations.1.to']);
    expect(failing([{ to: 2, up }, { to: 3, up }, { to: 4, up }])).toEqual(['data.migrations.2.to']);
    expect(failing([{ to: 2, up }, { to: 3, up }], [3])).toEqual(['data.compatibleWith.0']);
    expect(failing([{ to: 2, up }, { to: 3, up }], [2, 2])).toEqual(['data.compatibleWith.1']);
  });

  it('M1.3-E7 a schema that cannot become JSON Schema fails at its path', () => {
    const problem = recordingProblem((ext) => {
      ext.registerCommand('pdf.run', { description: 'Runs.', input: z.object({ count: z.string().transform((value) => value.length) }), handle });
    });
    expect(issuePaths(problem)).toEqual(['types.0.input']);
    expect(problem.issues?.[0]?.message).toMatch(/^the schema cannot be written as JSON Schema: /);
  });
});
