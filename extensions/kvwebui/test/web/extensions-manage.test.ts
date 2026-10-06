import { describe, expect, it } from 'vitest';
import { kernelQuerySchemas } from '@kvman/sdk';
import { fail } from './support/fake-api.ts';
import { click, extension, mountApp, settle, type, type Mounted } from './support/mount-app.ts';
import { notesApi } from './support/notes.ts';

// The Extensions page manages the preset (06 §6.6, ADR 0010, 5): it adds extensions and marks what a restart changes;
// an extension is removed from its own page (ADR 0014, 4).

const card = (app: Mounted, namespace: string) => app.find(`[data-test="extension-${namespace}"]`);
const page = (app: Mounted, namespace = 'notes') => app.find(`[data-test="extension-page-${namespace}"]`);
const pending = (app: Mounted, name: string) => app.find(`[data-test="pending-${name}"]`);
const presetOf = (extensions: Record<string, string>) =>
  kernelQuerySchemas['kernel.preset.get'].output.parse({ name: 'test', origin: 'home', file: '/home/ahmed/.kvman/presets/test.json', extensions });

async function install(app: Mounted, source: string): Promise<void> {
  await type(app.find('[data-test="add-source"]'), source);
  await click(app.find('[data-test="add-install"]'));
}

describe('the Extensions page manages extensions (06 §6.6, ADR 0010, 5)', () => {
  it('QA17-H19 the page marks a pending extension, and Install saves exactly the typed source', async () => {
    const api = notesApi();
    api.preset = presetOf({ '@test/notes': 'bundled', '@acme/later': 'npm:2.0.0' });
    const app = await mountApp(api, '/kvwebui/extensions');
    expect(app.find('[data-test="restart-banner"]')?.textContent).toContain('Restart kvman to apply');
    expect(app.find('[data-test="restart-banner"]')?.textContent).toContain('Pending changes: 1');
    expect(card(app, 'notes')?.querySelector('[data-test="extension-source"]')?.textContent).toBe('Bundled');
    expect(pending(app, '@acme/later')?.textContent).toContain('Starts after restart');
    expect(pending(app, '@acme/later')?.textContent).toContain('npm');

    await install(app, ' npm:@acme/notes@1.2.3  ');
    expect(api.callsTo('kernel.extensions.install').map((call) => call.input)).toEqual([{ source: 'npm:@acme/notes@1.2.3' }]);
    expect(app.find<HTMLInputElement>('[data-test="add-source"]')?.value).toBe('');
    expect(pending(app, '@acme/notes')?.textContent).toContain('Starts after restart');
    expect(app.find('[data-test="restart-banner"]')?.textContent).toContain('Pending changes: 2');
    expect(app.root.textContent).toContain('Added. Restart kvman to apply.');
  });

  it("QA17-H20 Remove, on the extension's page, asks first, then saves, and the page and the list show Removed after restart", async () => {
    const api = notesApi();
    const app = await mountApp(api, '/kvwebui/extension/notes');
    await click(page(app)?.querySelector<HTMLElement>('[data-test="remove"]') ?? null);
    expect(page(app)?.textContent).toContain('Remove @test/notes?');
    expect(api.callsTo('kernel.extensions.uninstall')).toEqual([]);

    await click(page(app)?.querySelector<HTMLElement>('[data-test="remove-cancel"]') ?? null);
    expect(page(app)?.querySelector('[data-test="remove"]')).not.toBeNull();
    expect(api.callsTo('kernel.extensions.uninstall')).toEqual([]);

    await click(page(app)?.querySelector<HTMLElement>('[data-test="remove"]') ?? null);
    await click(page(app)?.querySelector<HTMLElement>('[data-test="remove-confirm"]') ?? null);
    expect(api.callsTo('kernel.extensions.uninstall').map((call) => call.input)).toEqual([{ name: '@test/notes' }]);
    expect(page(app)?.querySelector('[data-test="extension-mark"]')?.textContent).toBe('Removed after restart');
    expect(page(app)?.querySelector('[data-test="remove"]')).toBeNull();
    expect(app.root.textContent).toContain('Removed. Restart kvman to apply.');
    await click(app.find('[data-test="extension-back"]'));
    expect(card(app, 'notes')?.querySelector('[data-test="extension-mark"]')?.textContent).toBe('Removed after restart');
    expect(app.find('[data-test="restart-banner"]')?.textContent).toContain('Pending changes: 1');
  });

  it('QA17-H21 adding and removing set no setting and no secret', async () => {
    const api = notesApi();
    const app = await mountApp(api, '/kvwebui/extensions');
    await install(app, 'npm:@acme/notes@1.2.3');
    await click(card(app, 'notes'));
    await click(page(app)?.querySelector<HTMLElement>('[data-test="remove"]') ?? null);
    await click(page(app)?.querySelector<HTMLElement>('[data-test="remove-confirm"]') ?? null);
    for (const call of api.calls) {
      expect(call.name.startsWith('kernel.settings.set') || call.name.startsWith('kernel.settings.reset') || call.name.startsWith('kernel.secrets.set') || call.name.startsWith('kernel.secrets.delete'), call.name).toBe(false);
    }
  });

  it('QA17-E17 a failure shows its Problem and keeps the form, a blank field disables Install, and a pending note shows for a bundled preset', async () => {
    const api = notesApi();
    const app = await mountApp(api, '/kvwebui/extensions');
    expect(app.find('[data-test="add-bundled-copy"]')?.textContent).toContain('saves your own copy of the bundled preset');
    expect(app.find('[data-test="add-hint"]')?.textContent).toContain('an exact version (npm:@acme/notes@1.2.3)');
    expect(app.find<HTMLButtonElement>('[data-test="add-install"]')?.disabled).toBe(true);
    api.handlers.set('kernel.extensions.install', () => fail('VALIDATION_FAILED', { source: 'npm:@acme/notes@1.2.3' }));
    await install(app, 'npm:@acme/notes@1.2.3');
    expect(app.find('[data-test="add-error"]')?.textContent).toContain("Something isn't valid.");
    expect(app.find<HTMLInputElement>('[data-test="add-source"]')?.value).toBe('npm:@acme/notes@1.2.3');
    expect(app.find('[data-test="restart-banner"]')).toBeNull();
    expect(app.root.textContent).not.toContain('Added.');

    api.handlers.set('kernel.extensions.uninstall', () => fail('NOT_FOUND'));
    await click(card(app, 'notes'));
    await click(page(app)?.querySelector<HTMLElement>('[data-test="remove"]') ?? null);
    await click(page(app)?.querySelector<HTMLElement>('[data-test="remove-confirm"]') ?? null);
    expect(page(app)?.querySelector('[data-test="remove-error"]')?.textContent).toContain("It wasn't found.");
    expect(page(app)?.querySelector('[data-test="extension-mark"]')).toBeNull();
    expect(app.root.textContent).not.toContain('Removed.');

    const home = notesApi();
    home.preset = presetOf({ '@test/notes': 'bundled' });
    expect((await mountApp(home, '/kvwebui/extensions')).find('[data-test="add-bundled-copy"]')).toBeNull();
  });

  it('QA17-E17 a preset that cannot be read hides the marks and shows an error card while the list still renders', async () => {
    const api = notesApi();
    api.handlers.set('kernel.preset.get', () => fail('VALIDATION_FAILED', { file: '/home/ahmed/.kvman/presets/test.json' }));
    const app = await mountApp(api, '/kvwebui/extensions');
    expect(app.find('[data-test="preset-error"]')?.textContent).toContain("Something isn't valid.");
    expect(app.find('[data-test="restart-banner"]')).toBeNull();
    expect(card(app, 'notes')).not.toBeNull();
  });

  it('QA17-E18 a stored preset equal to what is loaded shows no banner and no marks', async () => {
    const api = notesApi();
    api.extensions.push(extension('remote', {}, 'npm:1.2.3'));
    api.preset = presetOf({ '@test/notes': 'bundled', '@test/remote': 'npm:1.2.3' });
    const app = await mountApp(api, '/kvwebui/extensions');
    expect(app.find('[data-test="restart-banner"]')).toBeNull();
    expect(app.findAll('[data-test="extension-mark"]')).toEqual([]);
    expect(app.findAll('[data-test^="pending-"]')).toEqual([]);
  });

  it('QA17-E19 every state, in en and ar, shows no raw key', async () => {
    for (const language of ['en', 'ar']) {
      const api = notesApi();
      api.global.set('kernel.language', language);
      api.preset = presetOf({ '@test/notes': 'bundled', '@acme/later': 'npm:2.0.0' });
      const app = await mountApp(api, '/kvwebui/extensions');
      api.handlers.set('kernel.extensions.install', () => fail('VALIDATION_FAILED'));
      await install(app, 'npm:@acme/notes@1.2.3');
      await settle();
      const texts = [app.find('main')?.textContent ?? app.text()];
      await click(card(app, 'notes'));
      await click(page(app)?.querySelector<HTMLElement>('[data-test="remove"]') ?? null);
      texts.push(app.find('main')?.textContent ?? app.text());
      const text = texts.join(' ');
      expect(text, language).not.toMatch(/kvwebui\.[a-zA-Z]/);
      expect(document.documentElement.getAttribute('lang') ?? language).toBe(language);
    }
  });
});
