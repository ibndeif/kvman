import { kernelQuerySchemas } from '@kvman/sdk';
import { describe, expect, it, vi } from 'vitest';
import { fail } from './support/fake-api.ts';
import { click, mountApp, settle, type Mounted } from './support/mount-app.ts';
import { notesApi } from './support/notes.ts';

// "Restart now" on the Extensions page (06 §6.6, ADR 0024, 9): it asks inline, restarts kvman, waits until it answers
// again, and reloads the page; and the page says when a change was undone.

const presetOf = (extensions: Record<string, string>) =>
  kernelQuerySchemas['kernel.preset.get'].output.parse({ name: 'test', origin: 'home', file: '/home/ahmed/.kvman/presets/test.json', extensions });
const health = (uptimeMs: number, extra: Record<string, unknown> = {}) => ({ version: '0.1.0', preset: 'test', mode: 'web', workers: 1, uptimeMs, languages: ['en', 'ar'], ...extra });

const pendingApi = () => {
  const api = notesApi();
  api.preset = presetOf({ '@test/notes': 'bundled', '@acme/later': 'npm:2.0.0' });
  return api;
};
const find = (app: Mounted, test: string) => app.find(`[data-test="${test}"]`);

async function pressRestart(app: Mounted): Promise<void> {
  await click(find(app, 'restart-now-button'));
  await click(find(app, 'restart-confirm'));
}

describe('Restart now (06 §6.6, ADR 0024, 9)', () => {
  it('QA36-H15 it asks first, restarts, waits until kvman answers after not answering, and reloads', async () => {
    const api = pendingApi();
    const app = await mountApp(api, '/kvwebui/extensions');
    vi.useFakeTimers({ toFake: ['setTimeout'] });
    api.handlers.set('kernel.restart', () => {
      api.offline = true;
      return { restarting: true };
    });
    await click(find(app, 'restart-now-button'));
    expect(find(app, 'restart-now')?.textContent).toContain('Restart kvman? What is running stops.');
    expect(api.callsTo('kernel.restart')).toEqual([]);

    await click(find(app, 'restart-confirm'));
    expect(api.callsTo('kernel.restart')).toHaveLength(1);
    expect(find(app, 'restart-running')?.textContent).toBe('Restarting…');
    await vi.advanceTimersByTimeAsync(1000);
    expect(app.reloads()).toBe(0);
    api.offline = false;
    await vi.advanceTimersByTimeAsync(1000);
    await settle();
    expect(app.reloads()).toBe(1);
  });

  it('QA36-E12 a restart that is never seen down reloads once the uptime is smaller than before', async () => {
    const api = pendingApi();
    const app = await mountApp(api, '/kvwebui/extensions');
    vi.useFakeTimers({ toFake: ['setTimeout'] });
    let restarted = false;
    api.handlers.set('kernel.restart', () => {
      restarted = true;
      return { restarting: true };
    });
    api.handlers.set('kernel.health.get', () => health(restarted ? 30 : 50_000));
    await pressRestart(app);
    await vi.advanceTimersByTimeAsync(1000);
    await settle();
    expect(app.reloads()).toBe(1);
  });

  it('QA36-E10 Cancel calls nothing and brings the button back', async () => {
    const api = pendingApi();
    const app = await mountApp(api, '/kvwebui/extensions');
    await click(find(app, 'restart-now-button'));
    await click(find(app, 'restart-cancel'));
    expect(api.callsTo('kernel.restart')).toEqual([]);
    expect(find(app, 'restart-now-button')).not.toBeNull();
    expect(find(app, 'restart-confirm')).toBeNull();
  });

  it('QA36-E11 a failed restart shows its Problem and polls nothing', async () => {
    const api = pendingApi();
    const app = await mountApp(api, '/kvwebui/extensions');
    vi.useFakeTimers({ toFake: ['setTimeout'] });
    api.handlers.set('kernel.restart', () => fail('VALIDATION_FAILED'));
    await pressRestart(app);
    const healthCalls = api.callsTo('kernel.health.get').length;
    expect(find(app, 'restart-error')?.textContent).toContain("Something isn't valid.");
    expect(find(app, 'restart-now-button')).not.toBeNull();
    await vi.advanceTimersByTimeAsync(5000);
    expect(api.callsTo('kernel.health.get')).toHaveLength(healthCalls);
    expect(app.reloads()).toBe(0);
  });

  it('QA36-E13 with nothing pending the page has no Restart now', async () => {
    const app = await mountApp(notesApi(), '/kvwebui/extensions');
    expect(find(app, 'restart-banner')).toBeNull();
    expect(find(app, 'restart-now-button')).toBeNull();
  });

  it('QA36-H16 the page says that a change was undone, with the Problem, in English and in Arabic', async () => {
    const problem = { code: 'VALIDATION_FAILED', message: 'The extension @test/broken is invalid.' };
    const english = notesApi();
    english.handlers.set('kernel.health.get', () => health(1, { rolledBack: problem }));
    const app = await mountApp(english, '/kvwebui/extensions');
    expect(find(app, 'rolled-back')?.textContent).toContain("The last change was undone because kvman couldn't start with it.");
    expect(find(app, 'rolled-back')?.textContent).toContain('The extension @test/broken is invalid.');

    const arabic = notesApi();
    arabic.global.set('kernel.language', 'ar');
    arabic.handlers.set('kernel.health.get', () => health(1, { rolledBack: problem }));
    expect(find(await mountApp(arabic, '/kvwebui/extensions'), 'rolled-back')?.textContent).toContain('تم التراجع عن آخر تغيير لأن kvman لم يستطع العمل به.');
    expect(find(await mountApp(notesApi(), '/kvwebui/extensions'), 'rolled-back')).toBeNull();
  });
});
