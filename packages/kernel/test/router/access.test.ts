import { describe, expect, it } from 'vitest';
import { holdBlob, kernel, openRouterFixture, person, workspaceA } from './harness.ts';
import { adapterSend, blob, handlerSend } from './outcomes.ts';

const pdfProcess = { address: 'proc:job-9' as const, extension: '@acme/pdf' };

const types = [
  { access: 'all', type: 'pdf.import', payload: { blobId: blob } },
  { access: 'user', type: 'pdf.approve', payload: {} },
  { access: 'extensions', type: 'pdf.tools.set', payload: {} },
  { access: 'internal', type: 'pdf.record', payload: {} },
];

describe('access (plan 02 §2.4, 03 §3.3 step 4)', () => {
  it('M1.4-E8 each access admits exactly its callers', async () => {
    const fixture = openRouterFixture();
    fixture.grants.grant('@kvman/agent', workspaceA, { requested: [{ name: 'calls', types: ['pdf.*'] }] });
    for (const extension of ['@acme/pdf', '@kvman/agent']) holdBlob(fixture, extension, blob);
    const table: Record<string, string[]> = {};
    for (const { access, type, payload } of types) {
      table[access] = [
        await adapterSend(fixture, person, type, payload),
        await handlerSend(fixture, '@acme/pdf', { type, payload }),
        await adapterSend(fixture, pdfProcess, type, payload),
        await handlerSend(fixture, '@kvman/agent', { type, payload }),
        await adapterSend(fixture, kernel, type, payload),
      ];
    }
    const denied = 'CALLER_NOT_ALLOWED';
    expect(table).toEqual({
      all: ['ok', 'ok', 'ok', 'ok', 'ok'],
      user: ['ok', denied, denied, 'CAPABILITY_DENIED', 'ok'],
      extensions: [denied, 'ok', 'ok', 'ok', 'ok'],
      internal: [denied, 'ok', denied, 'CAPABILITY_DENIED', 'ok'],
    });
  });
});
