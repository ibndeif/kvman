import { describe, expect, it } from 'vitest';
import { messageRows, openRouterFixture, pdf, personCommand } from './harness.ts';
import { blob } from './outcomes.ts';

function issues(result: Awaited<ReturnType<typeof personCommand>>): string[] {
  return result.ok ? [] : (result.problem.issues ?? []).map((issue) => `${result.problem.code} ${issue.path}`);
}

describe('payload validation (ADRs 0055, 0056)', () => {
  it('M1.4-E11 payloads are checked against the manifest schema with Ajv', async () => {
    const fixture = openRouterFixture();
    expect(issues(await personCommand(fixture, { type: 'pdf.import', payload: { blobId: 'ABC' } }))).toEqual(['VALIDATION_FAILED payload.blobId']);
    expect(issues(await personCommand(fixture, { type: 'pdf.import', payload: { blobId: blob, meta: { pages: 'two' } } }))).toEqual(['VALIDATION_FAILED payload.meta.pages']);
    expect(await personCommand(fixture, { type: 'pdf.import', payload: { blobId: blob, source: 'not checked by Ajv', meta: { pages: 2 } } })).toMatchObject({ ok: true });
    const entry = pdf.types.find((candidate) => candidate.type === 'pdf.import');
    const schema = entry?.kind === 'command' ? entry.input : undefined;
    if (schema === undefined) throw new Error('pdf.import has no input schema');
    expect(fixture.validators.validatorFor(schema)).toBe(fixture.validators.validatorFor(schema));
  });

  it('M1.4-E12 payloads are inline up to 16 MB', async () => {
    const fixture = openRouterFixture();
    const large = await personCommand(fixture, { type: 'pdf.batch', payload: { batch: 'b1', part: 1, data: 'x'.repeat(1024 * 1024) } });
    expect(large).toMatchObject({ ok: true });
    expect(String(messageRows(fixture)[0]?.['payload']).length).toBeGreaterThan(1024 * 1024);
    const tooLarge = await personCommand(fixture, { type: 'pdf.batch', payload: { batch: 'b2', part: 1, data: 'x'.repeat(16 * 1024 * 1024) } });
    expect(tooLarge).toMatchObject({ ok: false, problem: { code: 'PAYLOAD_TOO_LARGE', params: { limit: 'payload', max: 16777216 } } });
  });
});
