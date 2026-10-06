import { describe, expect, it } from 'vitest';
import { fail } from './support/fake-api.ts';
import { click, mountApp, type } from './support/mount-app.ts';
import { notesApi } from './support/notes.ts';

// "Add an extension" asks for the source alone; the kernel reads the name (06 §6.6, ADR 0025).

const sourceField = (app: Awaited<ReturnType<typeof mountApp>>) => app.find<HTMLInputElement>('[data-test="add-source"]');
const installButton = (app: Awaited<ReturnType<typeof mountApp>>) => app.find<HTMLButtonElement>('[data-test="add-install"]');

describe('the Add an extension form has one field (06 §6.6, ADR 0025)', () => {
  it('QA37-H11 there is a Source field and no Name field; Install sends only the source, then clears and reloads', async () => {
    for (const language of ['en', 'ar']) {
      const api = notesApi();
      api.global.set('kernel.language', language);
      const app = await mountApp(api, '/kvwebui/extensions');
      expect(app.find('[data-test="add-name"]'), language).toBeNull();
      expect(app.findAll('[data-test="add-extension"] input'), language).toHaveLength(1);
      await type(sourceField(app), 'path:/home/me/notes');
      expect(installButton(app)?.disabled, language).toBe(false);
      const presetReads = api.callsTo('kernel.preset.get').length;
      await click(installButton(app));
      expect(api.callsTo('kernel.extensions.install').map((call) => call.input), language).toEqual([{ source: 'path:/home/me/notes' }]);
      expect(sourceField(app)?.value, language).toBe('');
      expect(api.callsTo('kernel.preset.get').length, language).toBeGreaterThan(presetReads);
      expect(app.find('[data-test="add-extension"]')?.textContent, language).not.toMatch(/kvwebui\./);
    }
  });

  it('QA37-E10 Install waits for a source: empty or blank leaves it disabled and calls nothing', async () => {
    const api = notesApi();
    const app = await mountApp(api, '/kvwebui/extensions');
    expect(installButton(app)?.disabled).toBe(true);
    await type(sourceField(app), '   ');
    expect(installButton(app)?.disabled).toBe(true);
    await click(installButton(app));
    expect(api.callsTo('kernel.extensions.install')).toEqual([]);
  });

  it('QA37-E11 a failed install shows its Problem, keeps the source, and does not reload the preset', async () => {
    const api = notesApi();
    api.handlers.set('kernel.extensions.install', () => fail('VALIDATION_FAILED'));
    const app = await mountApp(api, '/kvwebui/extensions');
    await type(sourceField(app), 'npm:@acme/notes@1.2.3');
    const presetReads = api.callsTo('kernel.preset.get').length;
    await click(installButton(app));
    expect(app.find('[data-test="add-error"]')?.textContent).toContain("Something isn't valid.");
    expect(sourceField(app)?.value).toBe('npm:@acme/notes@1.2.3');
    expect(api.callsTo('kernel.preset.get').length).toBe(presetReads);
  });
});
