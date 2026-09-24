import { describe, expect, it } from 'vitest';
import { schemaDocumentSchema, sseMessageSchemas } from '../src/index.ts';
import { expectRoundTrip, issuePaths } from './assertions.ts';

const id = '01JAZ3K4M5N6P7Q8R9S0T1V2W3';

const schemaDocument = {
  kernelVersion: '2.0.0', shellVersion: '2.0.0', protocolVersion: 1,
  extensions: [{ name: '@acme/pdf', namespace: 'pdf', title: '$t.meta.title', description: 'PDF translation.', icon: 'file-text', implements: [] }],
  types: [{ type: 'pdf.translate', kind: 'command', owner: '@acme/pdf', namespace: 'pdf', description: 'Translate a PDF.',
    input: { type: 'object' }, output: { type: 'object' }, examples: [{ fileId: 'f1', lang: 'ar' }], access: 'all',
    agentTool: { title: 'Translate PDF' }, lane: true, scope: 'workspace' }],
  entities: [{ type: 'pdf.file', owner: '@acme/pdf', description: 'An imported PDF file.', schema: { type: 'object' }, display: { title: '$item.name' } }],
  errors: [{ code: 'pdf/NOT_FOUND', owner: '@acme/pdf', description: 'Missing file.', title: 'No such file', retryable: false }],
  contributions: [{ id: 'pdf.preview', kind: 'renderer', owner: '@acme/pdf', description: 'PDF viewer.', target: 'mime:application/pdf' }],
  components: [
    { name: 'split', owner: 'shell', form: 'builtin', description: 'Two panes.', props: { type: 'object' }, events: {}, children: 'any',
      childCount: { min: 2, max: 2 }, examples: [{ type: 'split' }], since: '2.0.0' },
    { name: 'tab', owner: 'shell', form: 'builtin', description: 'One tab.', props: { type: 'object' }, events: {}, children: 'any',
      parents: ['tabs'], examples: [], since: '2.0.0' },
    { name: 'button', owner: 'shell', form: 'builtin', description: 'A button.', props: { type: 'object' },
      events: { onClick: { description: 'Clicked.' } }, children: 'none', examples: [] },
  ],
  contracts: [{ name: 'agent', major: 1, types: ['agent.send'] }],
  frameSlots: [{ name: 'frame.sidebar', description: 'The sidebar.', accepts: ['navGroup', 'navItem', 'separator'] }],
};

describe('SSE messages and the schema endpoint (plan 12 §12.3, §12.7, ADRs 0025, 0027, 0030)', () => {
  it('M0.4-E24 every SSE message round-trips', () => {
    expectRoundTrip(sseMessageSchemas.hello, { userId: 'local', cursor: 120, protocolVersion: 1, kernelVersion: '2.0.0', subscriptions: ['q1'], notifications: { unread: 2, attention: 1 } });
    expectRoundTrip(sseMessageSchemas.event, { sid: 'q1', seq: 121, event: {
      id, type: 'pdf.translated', source: 'ext:@acme/pdf', workspaceId: 'a'.repeat(64), payload: { fileId: 'f1' }, correlationId: id, causationId: id, createdAt: 1 } });
    expectRoundTrip(sseMessageSchemas.live, { sid: 'q2', type: 'pdf.progress.updated', key: 'f1', run: id, n: 7, chunk: { text: 'Bonjour' } });
    expectRoundTrip(sseMessageSchemas.reply, { clientId: 'tab-1', id, ok: true, data: { blobId: 'b' } });
    expectRoundTrip(sseMessageSchemas.reply, { clientId: 'tab-1', id, ok: false, problem: { code: 'CANCELLED', title: 'The message was cancelled', retryable: false, correlationId: id } });
    expectRoundTrip(sseMessageSchemas.ui, { clientId: 'tab-1', type: 'ui.toast', source: 'ext:@acme/pdf', payload: { text: '$t.toast.imported' } });
    expectRoundTrip(sseMessageSchemas.ui, { type: 'ui.navigate', source: 'ext:@acme/pdf', payload: { route: '/files/f1' } });
    expectRoundTrip(sseMessageSchemas.resync, { reason: 'cursor too old' });
    expectRoundTrip(sseMessageSchemas.close, { reason: 'slow-consumer' });
    expect(issuePaths(sseMessageSchemas.close, { reason: 'bored' })).toEqual(['reason']);
    expect(issuePaths(sseMessageSchemas.live, { sid: 'q2', type: 'pdf.progress.updated', key: 'f1', run: id, n: -1, chunk: { text: '' } })).toEqual(['n']);
  });

  it('M0.4-E25 the schema document round-trips and never holds internal types', () => {
    expectRoundTrip(schemaDocumentSchema, schemaDocument);
    const withInternal = { ...schemaDocument, types: [{ ...schemaDocument.types[0], access: 'internal' }] };
    expect(issuePaths(schemaDocumentSchema, withInternal)).toEqual(['types.0.access']);
  });
});
