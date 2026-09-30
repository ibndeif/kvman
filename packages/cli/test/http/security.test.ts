import { describe, expect, it } from 'vitest';
import { api } from '../support/api.ts';
import { startKvman } from '../support/kvman-child.ts';
import { useSandbox } from '../support/sandbox.ts';

const sandbox = useSandbox();

describe('Host and Origin (04 §4.2, ADR 0009, 36)', { timeout: 60_000 }, () => {
  it('M1.7-H2 a foreign Host, a rebinding Host, and a foreign Origin each get FORBIDDEN_ORIGIN, echoing nothing', async () => {
    const world = sandbox();
    const kvman = await startKvman(world, ['--preset', world.appPreset()]);
    const calls = api(kvman.port);
    const own = `127.0.0.1:${String(kvman.port)}`;
    for (const headers of [{ host: 'evil.com' }, { host: `evil.com:${String(kvman.port)}` }, { host: own, origin: 'http://evil.com' }]) {
      const answer = await calls.raw('/api/locales/en', headers);
      expect(answer.status, JSON.stringify(headers)).toBe(200);
      const parsed: unknown = JSON.parse(answer.body);
      expect(parsed).toEqual({ ok: false, problem: { code: 'FORBIDDEN_ORIGIN', message: expect.any(String) } });
      expect(answer.body).not.toContain('evil.com');
    }
    expect((await calls.raw('/api/locales/en', { host: own, origin: `http://${own}` })).body).toContain('"ok":true');
  });
});
