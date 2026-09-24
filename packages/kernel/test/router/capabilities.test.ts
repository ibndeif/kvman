import { describe, expect, it } from 'vitest';
import { agentProcess, openRouterFixture, person, workspaceA } from './harness.ts';
import { adapterSend, handlerPublish, handlerSend } from './outcomes.ts';

const translate = { type: 'pdf.translate', payload: { fileId: 'f1', lang: 'ar' } };
const list = { type: 'pdf.files.list', payload: {} };

function queryOutcome(fixture: ReturnType<typeof openRouterFixture>): string {
  const result = fixture.router.admitQuery({ sender: { address: 'ext:@kvman/agent', extension: '@kvman/agent' }, ...list, cause: undefined, workspaceId: workspaceA });
  return result.ok ? 'ok' : result.problem.code;
}

describe('capabilities (plan 05 §5.7, ADR 0052)', () => {
  it('M1.4-E9 calls patterns, tools, missing grants, and processes', async () => {
    const exact = openRouterFixture();
    exact.grants.grant('@kvman/agent', workspaceA, { requested: [{ name: 'calls', types: ['pdf.translate'] }] });
    expect(await handlerSend(exact, '@kvman/agent', translate)).toBe('ok');
    expect(queryOutcome(exact)).toBe('CAPABILITY_DENIED');

    const prefix = openRouterFixture();
    prefix.grants.grant('@kvman/agent', workspaceA, { requested: [{ name: 'calls', types: ['pdf.*'] }] });
    expect(await handlerSend(prefix, '@kvman/agent', translate)).toBe('ok');
    expect(queryOutcome(prefix)).toBe('ok');

    const tools = openRouterFixture();
    tools.grants.grant('@kvman/agent', workspaceA, { requested: [{ name: 'tools' }] });
    expect(await handlerSend(tools, '@kvman/agent', translate)).toBe('ok');
    expect(await handlerSend(tools, '@kvman/agent', { type: 'pdf.import', payload: { blobId: 'a'.repeat(64) } })).toBe('CAPABILITY_DENIED');

    const none = openRouterFixture();
    expect(await handlerSend(none, '@kvman/agent', translate)).toBe('CAPABILITY_DENIED');
    expect(await adapterSend(none, agentProcess, translate.type, translate.payload)).toBe('CAPABILITY_DENIED');
    none.grants.grant('@kvman/agent', workspaceA, { requested: [{ name: 'calls', types: ['pdf.translate'] }] });
    expect(await adapterSend(none, agentProcess, translate.type, translate.payload)).toBe('ok');
  });

  it('M1.4-E10 only the owner publishes its events, and never a live one', async () => {
    const fixture = openRouterFixture();
    const imported = { type: 'pdf.imported', payload: { fileId: 'f1' } };
    expect(await handlerPublish(fixture, '@acme/pdf', imported)).toBe('ok');
    expect(await handlerPublish(fixture, '@kvman/agent', imported)).toBe('CAPABILITY_DENIED');
    for (const sender of [person, { address: 'proc:job-2' as const, extension: '@acme/pdf' }]) {
      const result = await fixture.pipeline.enqueue({
        origin: { kind: 'adapter', sender, workspaceId: workspaceA, messageId: '01JAZ3K4M5N6P7Q8R9S0T1V2W5' },
        writes: [], sends: [], publishes: [imported],
      });
      expect(result).toMatchObject({ committed: false, problem: { code: 'CAPABILITY_DENIED' } });
    }
    expect(await handlerPublish(fixture, '@acme/pdf', { type: 'pdf.progress.updated', payload: { text: 'x' } })).toBe('CAPABILITY_DENIED');
  });
});
