import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { workspaceA } from '../hosts/harness.ts';
import type { InstallFixture } from '../install/harness.ts';
import { query, run, valueOf } from '../workspaces/harness.ts';
import { enableAt, isolationTests, openIsolationFixture, seedItems } from './harness.ts';

let fixture: InstallFixture;
beforeEach(async () => {
  fixture = await openIsolationFixture();
  enableAt(fixture, workspaceA, '@acme/probe', 'sandboxed');
});
afterEach(async () => {
  await fixture.close();
});

describe('reads through the read pool (plan 04 §4.1, ADR 0131)', isolationTests, () => {
  it('M2.4-E18 a sandboxed handler reads its own pending writes', async () => {
    await seedItems(fixture, 'p', 'p', 3, 1);
    expect(valueOf(await run(fixture, 'probe.pending'))).toEqual({
      found: ['fresh', 'p0', 'p2'], count: 3, fresh: 'fresh', gone: true, keys: ['p-extra', 'p-seeded'],
    });
  });

  it('M2.4-E19 a sandboxed read over the cap fails like any other', async () => {
    await seedItems(fixture, 'bulk', 'b', 5001, 1);
    expect(await query(fixture, 'probe.scan', {}, undefined, workspaceA)).toMatchObject({ ok: false, problem: { code: 'STORE_RESULT_TOO_LARGE' } });
    expect(await query(fixture, 'probe.scan', { where: { 'a"b': 'x' } }, undefined, workspaceA)).toMatchObject({ ok: false, problem: { code: 'VALIDATION_FAILED' } });
  });
});
