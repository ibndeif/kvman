import { performance } from 'node:perf_hooks';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { send } from '../adapters/http-client.ts';
import { workspaceA } from '../hosts/harness.ts';
import type { InstallFixture } from '../install/harness.ts';
import { query } from '../workspaces/harness.ts';
import { enableAt, isolationTests, openIsolationFixture, seedItems, serveHttp } from './harness.ts';

let fixture: InstallFixture;
beforeEach(async () => {
  fixture = await openIsolationFixture();
  enableAt(fixture, workspaceA, '@acme/probe', 'sandboxed');
});
afterEach(async () => {
  await fixture.close();
});

describe('a large read beside /health (plan 04 §4.1, ADR 0131)', isolationTests, () => {
  it('M2.4-H5 a large find from a sandboxed extension does not delay /health', async () => {
    await seedItems(fixture, 'bulk', 'b', 5000, 3000);
    const served = await serveHttp(fixture);
    try {
      // The adapter's first request pays for its cold start; the scan's effect is measured on a warm path.
      expect((await send(served.port, 'GET', '/api/v1/health')).status).toBe(200);
      let scanning = true;
      const scan = query(fixture, 'probe.scan', {}, undefined, workspaceA).finally(() => {
        scanning = false;
      });
      const latencies: number[] = [];
      while (scanning) {
        const started = performance.now();
        const answer = await send(served.port, 'GET', '/api/v1/health');
        latencies.push(performance.now() - started);
        expect(answer.status).toBe(200);
        await new Promise((resolve) => setTimeout(resolve, 10));
      }
      expect(await scan).toEqual({ ok: true, value: { count: 5000 } });
      expect(latencies.length).toBeGreaterThan(0);
      expect(Math.max(...latencies)).toBeLessThanOrEqual(25);
    } finally {
      await served.close();
    }
  });

});
