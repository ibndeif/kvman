import { z, type Ext } from '@kvman/sdk';
import { describe, expect, it } from 'vitest';
import { errorsOf, recordedIssues } from './harness.ts';

const handle = async (): Promise<null> => null;
const syntaxHint = 'write placeholders as {{ $payload.<field> }}, {{ $context.<key> }}, or {{ $message.id }}';

function laneErrors(input: Parameters<Ext['registerCommand']>[1]['input'], lane: string) {
  return errorsOf(recordedIssues((ext) => ext.registerCommand('pdf.run', { description: 'Runs.', input, lane, handle })));
}

type Node = { name: string; children: Node[] };
const node: z.ZodType<Node> = z.lazy(() => z.object({ name: z.string(), children: z.array(node) }));

describe('lane templates against schemas (plan 02 §2.6, ADR 0109)', () => {
  it('M2.1-E11 a lane without a valid placeholder fails with the syntax hint', () => {
    const input = z.object({ id: z.string() });
    for (const lane of ['fixed', 'x:{{ $payload }}', 'x:{{ $other.x }}', 'x:{{ $payload.id }']) {
      expect(laneErrors(input, lane)).toEqual([expect.objectContaining({ path: 'types.0.lane', hint: syntaxHint })]);
    }
  });

  it('M2.1-E12 unions, $ref, records, loose objects, and unknown values declare their paths', () => {
    const union = z.object({ target: z.union([z.object({ fileId: z.string() }), z.object({ url: z.string() })]) });
    expect(laneErrors(union, 'x:{{ $payload.target.url }}')).toEqual([]);
    expect(laneErrors(z.object({ tree: node }), 'x:{{ $payload.tree.name }}')).toEqual([]);
    expect(laneErrors(z.object({ byId: z.record(z.string(), z.object({ owner: z.string() })) }), 'x:{{ $payload.byId.any.owner }}')).toEqual([]);
    expect(laneErrors(z.object({ meta: z.looseObject({}) }), 'x:{{ $payload.meta.anything }}')).toEqual([]);
    expect(laneErrors(z.object({ extra: z.unknown() }), 'x:{{ $payload.extra.deep.path }}')).toEqual([]);
  });

  it('M2.1-E13 a path into a string, or missing from every branch, fails with the fields where it stops', () => {
    expect(laneErrors(z.object({ name: z.string() }), 'x:{{ $payload.name.first }}')).toEqual([
      { path: 'types.0.lane', message: '"$payload.name.first" is not a field of the input schema', hint: 'no fields are declared there' },
    ]);
    const union = z.object({ target: z.union([z.object({ fileId: z.string() }), z.object({ url: z.string() })]) });
    expect(laneErrors(union, 'x:{{ $payload.target.path }}')).toEqual([
      { path: 'types.0.lane', message: '"$payload.target.path" is not a field of the input schema', hint: 'fields there: fileId, url' },
    ]);
  });

  it('M2.1-E14 subscription lanes read the payload of their own event or a kernel event', () => {
    const issues = errorsOf(recordedIssues((ext) => {
      ext.registerEvent('pdf.imported', { description: 'Imported.', payload: z.object({ fileId: z.string() }) });
      ext.registerEvent('pdf.cleared', { description: 'Cleared.' });
      ext.subscribe('pdf.imported', { description: 'Indexes.', lane: 'file:{{ $payload.id }}', handle: async () => undefined });
      ext.subscribe('pdf.cleared', { description: 'Resets.', lane: 'all:{{ $payload.scope }}', handle: async () => undefined });
      ext.subscribe('kernel.message.dead-lettered', { description: 'Reports.', lane: 'dead:{{ $payload.messageId }}', handle: async () => undefined });
    }));
    expect(issues).toEqual([
      { path: 'subscriptions.0.lane', message: '"$payload.id" is not a field of the event payload', hint: 'fields there: fileId' },
      { path: 'subscriptions.1.lane', message: '"$payload.scope" is not a field of the event payload', hint: 'no fields are declared there' },
    ]);
    const unknownField = errorsOf(recordedIssues((ext) => {
      ext.subscribe('kernel.message.dead-lettered', { description: 'Reports.', lane: 'dead:{{ $payload.nope }}', handle: async () => undefined });
    }));
    expect(unknownField).toEqual([{ path: 'subscriptions.0.lane', message: '"$payload.nope" is not a field of the event payload', hint: 'fields there: messageId, type, correlationId' }]);
  });

  it('M2.1-E15 lanes on foreign events and wildcard subscriptions are not checked here', () => {
    expect(errorsOf(recordedIssues((ext) => {
      ext.subscribe('agent.session.deleted', { description: 'Cleans up.', lane: 'session:{{ $payload.anything }}', handle: async () => undefined });
      ext.subscribe('agent.*', { description: 'Watches.', lane: 'agent:{{ $payload.whatever }}', handle: async () => undefined });
    }))).toEqual([]);
  });

  it('M2.1-E16 context and message paths are not checked against schemas', () => {
    for (const lane of ['x:{{ $context.sessionId }}', 'x:{{ $message.id }}', 'x:{{ $message.source }}', 'x:{{ $message.workspaceId }}']) {
      expect(laneErrors(z.object({}), lane)).toEqual([]);
    }
  });
});
