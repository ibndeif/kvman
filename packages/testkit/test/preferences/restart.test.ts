import { afterEach, describe, expect, it, vi } from 'vitest';
import { command as httpCommand } from '../adapters/http-client.ts';
import { temporaryHome } from '../daemon/harness.ts';
import { bootHome, type BootedHome } from '../first-run/builtins.ts';
import { workspaceA } from '../hosts/harness.ts';
import { person } from '../install/harness.ts';
import { prepareLingoHome } from '../i18n/harness.ts';

let fixture: BootedHome | undefined;

afterEach(async () => {
  await fixture?.close();
  fixture = undefined;
});

describe('preferences across daemon restarts', { timeout: 120_000 }, () => {
  it('M2.11-E38 reloads the saved locale at boot and gives it to a new chain', async () => {
    const home = temporaryHome();
    await prepareLingoHome(home);
    fixture = await bootHome(home);
    expect((await httpCommand(fixture.kernel.identity.port, 'kernel.user.preferences.set', { locale: 'ar' })).status).toBe(200);
    await fixture.close();
    fixture = undefined;

    fixture = await bootHome(home);
    expect(await fixture.kernel.runtime.query({ sender: person, type: 'kernel.user.preferences.get', payload: {}, cause: undefined, workspaceId: undefined }))
      .toEqual({ ok: true, value: { locale: 'ar', theme: 'app', desktopAlerts: false } });
    expect((await httpCommand(fixture.kernel.identity.port, 'lingo.start', {}, { workspaceId: workspaceA })).status).toBe(200);
    await vi.waitFor(async () => {
      expect(await fixture?.kernel.runtime.query({ sender: person, type: 'lingo.locales.get', payload: {}, cause: undefined, workspaceId: workspaceA }))
        .toEqual({ ok: true, value: { start: 'ar', relay: 'ar', finish: 'ar' } });
    });
  });
});
