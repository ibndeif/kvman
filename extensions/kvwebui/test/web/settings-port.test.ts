import { describe, expect, it } from 'vitest';
import { portThisRun } from '../../web/src/state/hidden-screens.ts';
import { setting } from './support/fake-api.ts';
import { openSettings } from './support/settings-page.ts';

const portSetting = (value: number) => setting('kernel.port', { type: 'integer', minimum: 1, maximum: 65535 }, ['global'], { default: value });

describe("the port row says the run's port (06 §6.6, ADR 0082, 10)", () => {
  it('QA52-H10 the page names the port it is served on when it differs from kernel.port', async () => {
    expect(portThisRun('3738', 3737)).toBe(3738);
    expect(portThisRun('3737', 3737)).toBeUndefined();
    expect(portThisRun('', 3737)).toBeUndefined();

    const served = window.location.port;
    expect(served).toMatch(/^\d+$/);
    const other = Number(served) === 3737 ? 3738 : 3737;
    const differs = await openSettings((api) => api.settings.push(portSetting(other)), 'settings');
    expect(differs.part('kernel.port', 'port-this-run')?.textContent).toBe(`This run listens on port ${served}.`);

    const same = await openSettings((api) => api.settings.push(portSetting(Number(served))), 'settings');
    expect(same.part('kernel.port', 'port-this-run')).toBeNull();
  });
});
