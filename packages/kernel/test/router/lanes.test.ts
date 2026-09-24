import { describe, expect, it } from 'vitest';
import { renderLane, type LaneSource } from '../../src/router/lane-rendering.ts';
import { messageRows, openRouterFixture, personCommand, workspaceA } from './harness.ts';

const source: LaneSource = {
  id: '01JAZ3K4M5N6P7Q8R9S0T1V2W3', source: 'ext:@acme/pdf', workspaceId: workspaceA,
  payload: { fileId: 'f1', file: { id: 'f2' }, part: 3, missing: null, flag: true, nested: { a: 1 } }, context: { sessionId: 's1' },
};

function rendered(template: string): string {
  const result = renderLane(template, source, 'lane');
  return result.ok ? result.lane : `${result.refusal.code} ${result.refusal.context.issues?.[0]?.message ?? ''}`;
}

describe('lanes (plan 02 §2.6, ADRs 0054, 0058)', () => {
  it('M1.4-E13 templates render payload, context, and message values', async () => {
    expect(rendered('file:{{ $payload.fileId }}')).toBe('file:f1');
    expect(rendered('file:{{$payload.file.id}}')).toBe('file:f2');
    expect(rendered('part:{{ $payload.part }}')).toBe('part:3');
    expect(rendered('session:{{ $context.sessionId }}')).toBe('session:s1');
    expect(rendered('job:{{ $message.id }}|{{ $message.source }}|{{ $message.workspaceId }}')).toBe(`job:${source.id}|ext:@acme/pdf|${workspaceA}`);
    expect(rendered('x:{{ $payload.fileId }}:{{ $payload.absent }}')).toBe('x:f1:-');
    expect(rendered('x:{{ $payload.absent }}:{{ $context.other }}')).toMatch(/^VALIDATION_FAILED none of the lane template paths/);
    for (const path of ['missing', 'flag', 'nested']) expect(rendered(`x:{{ $payload.${path} }}`)).toMatch(/^VALIDATION_FAILED .* is not a string or a number$/);
    const fixture = openRouterFixture();
    await personCommand(fixture, { type: 'pdf.batch', payload: { batch: 'b1', part: 2 } });
    expect(messageRows(fixture)[0]?.['lane']).toBe('@acme/pdf|batch:b1/2');
  });

  it('M1.4-E14 a caller lane is used only when the handler declares none', async () => {
    const fixture = openRouterFixture();
    expect(await personCommand(fixture, { type: 'pdf.import', payload: { blobId: 'a'.repeat(64) }, lane: 'mine' })).toMatchObject({ ok: true });
    expect(messageRows(fixture)[0]?.['lane']).toBe('@acme/pdf|mine');
    const declared = await personCommand(fixture, { type: 'pdf.translate', payload: { fileId: 'f1', lang: 'ar' }, lane: 'mine' });
    expect(declared).toMatchObject({ ok: false, problem: { code: 'VALIDATION_FAILED', issues: [{ path: 'lane', message: 'this handler declares its lane' }] } });
  });
});
