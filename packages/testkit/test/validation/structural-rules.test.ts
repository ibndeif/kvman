import type { Issue } from '@kvman/protocol';
import { z, type Ext } from '@kvman/sdk';
import { describe, expect, it } from 'vitest';
import { errorsOf, pdfManifest, reason, recordedIssues, setAt, validatedIssues } from './harness.ts';

const handle = async (): Promise<null> => null;
const input = z.object({});
const up = async (): Promise<void> => undefined;

type Rule = { rule: string; issues: () => Issue[]; path: string; hint: string };

function recorded(setup: (ext: Ext) => void, options: { namespace?: string; packageName?: string } = {}): () => Issue[] {
  return () => recordedIssues(setup, options);
}

function changed(path: ReadonlyArray<string | number>, value: Parameters<typeof setAt>[2]): () => Issue[] {
  return () => validatedIssues(pdfManifest((manifest) => setAt(manifest, path, value)));
}

let run = 0;

const rules: Rule[] = [
  { rule: 'protocol schema', issues: changed(['types', 0, 'color'], 'red'), path: 'types.0', hint: 'remove "color"' },
  { rule: 'manifestVersion', issues: changed(['manifestVersion'], 2), path: 'manifestVersion', hint: 'this kvman reads manifest version 1; upgrade kvman' },
  { rule: 'meta.name is the package name', issues: recorded(() => undefined, { packageName: '@acme/other' }), path: 'meta.name', hint: 'set meta.name to "@acme/other", the name in package.json' },
  { rule: 'namespace format', issues: changed(['meta', 'namespace'], 'P'), path: 'meta.namespace', hint: 'use 2–32 lowercase letters, digits, and "-", e.g. "pdf"' },
  { rule: 'reserved namespace', issues: recorded(() => undefined, { namespace: 'kernel' }), path: 'meta.namespace', hint: 'choose another namespace; kernel, ui, frame, sys, and preset are reserved' },
  {
    rule: 'setup is deterministic',
    issues: recorded((ext) => {
      run += 1;
      ext.registerCommand('pdf.run', { description: `Run number ${run}.`, input, handle });
    }),
    path: 'types.0.description', hint: 'register the same things on every run; setup reads no clock, random numbers, or state',
  },
  { rule: 'description required', issues: recorded((ext) => ext.registerCommand('pdf.run', { description: ' ', input, handle })), path: 'types.0.description', hint: 'add a description in English, for developers and LLMs' },
  { rule: 'full public names', issues: recorded((ext) => ext.registerCommand('translate', { description: 'Translates.', input, handle })), path: 'types.0.type', hint: 'did you mean "pdf.translate"?' },
  {
    rule: 'one name, one kind',
    issues: recorded((ext) => {
      ext.registerCommand('pdf.imported', { description: 'Imports.', input, handle });
      ext.registerEvent('pdf.imported', { description: 'Imported.' });
    }),
    path: 'types.1.type', hint: 'one name is never used for two kinds; rename one of them',
  },
  {
    rule: 'unique within a kind',
    issues: recorded((ext) => {
      ext.registerCollection('files', { description: 'Files.', schema: z.object({ id: z.string() }) });
      ext.registerCollection('files', { description: 'Files again.', schema: z.object({ id: z.string() }) });
    }),
    path: 'data.collections.1.name', hint: 'rename one of them',
  },
  { rule: 'error code namespace', issues: recorded((ext) => ext.registerError('NOT_FOUND', { description: 'Missing.', title: 'Missing' })), path: 'errors.0.code', hint: 'did you mean "pdf/NOT_FOUND"?' },
  { rule: 'error title', issues: changed(['errors', 0, 'title'], ''), path: 'errors.0.title', hint: 'add an English title' },
  {
    rule: 'lossless JSON Schema',
    issues: recorded((ext) => ext.registerCommand('pdf.run', { description: 'Runs.', input: z.object({ count: z.string().transform((value) => value.length) }), handle })),
    path: 'types.0.input', hint: 'keep schemas to what JSON Schema expresses; convert values in the handler instead',
  },
  {
    rule: 'config field description',
    issues: recorded((ext) => ext.registerConfig({ scope: 'workspace', schema: z.object({ language: z.string() }) })),
    path: 'config.schema.properties.language', hint: 'add .describe(\'…\') to the field "language"',
  },
  {
    rule: 'lane syntax',
    issues: recorded((ext) => ext.registerCommand('pdf.run', { description: 'Runs.', input: z.object({ fileId: z.string() }), lane: 'file:{{ fileId }}', handle })),
    path: 'types.0.lane', hint: 'write placeholders as {{ $payload.<field> }}, {{ $context.<key> }}, or {{ $message.id }}',
  },
  {
    rule: 'lane path',
    issues: recorded((ext) => ext.registerCommand('pdf.translate', { description: 'Translates.', input: z.object({ fileId: z.string(), lang: z.string() }), lane: 'file:{{ $payload.fileid }}', handle })),
    path: 'types.0.lane', hint: 'fields there: fileId, lang',
  },
  { rule: '5 MB', issues: changed(['types', 3, 'examples'], ['x'.repeat(5 * 1024 * 1024)]), path: '', hint: 'keep the manifest under 5 MB: shorten examples, views, and catalogs' },
  {
    rule: 'required types are covered',
    issues: recorded((ext) => ext.requireTypes(['fs.file.get'], { reason })),
    path: 'permissions.requireTypes.0.types.0', hint: 'add ext.requestCapability(\'calls\', { types: [\'fs.file.get\'] }), or subscribe to it if it is an event',
  },
  {
    rule: 'slash access',
    issues: recorded((ext) => ext.registerCommand('pdf.run', { description: 'Runs.', input, access: 'extensions', slash: { name: 'run', description: 'Run' }, handle })),
    path: 'types.0.slash', hint: 'set access to all or user, or remove slash',
  },
  {
    rule: 'agent tool access',
    issues: recorded((ext) => ext.registerQuery('pdf.runs.list', { description: 'Lists.', input, output: input, access: 'user', agentTool: { title: 'List runs' }, handle: async () => ({}) })),
    path: 'types.0.agentTool', hint: 'set access to all or extensions, or remove agentTool',
  },
  { rule: 'live event shape', issues: changed(['types', 2, 'payload'], { type: 'object' }), path: 'types.2.chunk', hint: 'declare chunk ("text", "value", or "data") and no payload' },
  {
    rule: 'no subscription to a live event',
    issues: recorded((ext) => {
      ext.registerEvent('pdf.progress.updated', { description: 'Progress.', delivery: 'live', chunk: 'text' });
      ext.subscribe('pdf.progress.updated', { description: 'Watches.', handle: async () => undefined });
    }),
    path: 'subscriptions.0.event', hint: 'subscribe to a durable or transient event instead',
  },
  {
    rule: 'once-only calls',
    issues: recorded((ext) => {
      ext.registerConfig({ scope: 'workspace', schema: z.object({}) });
      ext.registerConfig({ scope: 'workspace', schema: z.object({}) });
    }),
    path: 'config', hint: 'call registerConfig once',
  },
  { rule: 'contiguous migrations', issues: recorded((ext) => ext.registerDataVersion(3, { migrations: [{ to: 3, up }] })), path: 'data.migrations', hint: 'register one migration for each version from 2 to 3' },
  {
    rule: 'handlers are functions',
    issues: recorded((ext) => {
      const notAFunction: unknown = 'handler';
      Reflect.apply(ext.registerCommand, ext, ['pdf.run', { description: 'Runs.', input, handle: notAFunction }]);
    }),
    path: 'types.0.handler', hint: 'pass an async function as handle',
  },
];

describe('structural validation (plan 06 §6.3, ADRs 0106–0110)', () => {
  it('M2.1-H1 every structural rule fails its fixture with a hint', () => {
    const outcomes = rules.map(({ rule, issues }) => ({ rule, errors: errorsOf(issues()).map(({ path, hint }) => ({ path, hint })) }));
    expect(outcomes).toEqual(rules.map(({ rule, path, hint }) => ({ rule, errors: [{ path, hint }] })));
  });
});
