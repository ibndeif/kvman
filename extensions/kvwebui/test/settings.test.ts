import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import { createTestKernel, type TestKernel, type TestKernelOptions } from '@kvman/testkit';

const kvwebuiFolder = fileURLToPath(new URL('..', import.meta.url));
const kernels: TestKernel[] = [];

afterEach(async () => {
  for (const kernel of kernels.splice(0)) await kernel.close();
});

async function start(settings: TestKernelOptions['settings']): Promise<TestKernel> {
  const kernel = await createTestKernel({ extensions: [kvwebuiFolder], ...(settings === undefined ? {} : { settings }) });
  kernels.push(kernel);
  return kernel;
}

const problem = (code: string) => ({ problem: { code } });

describe("kvwebui's settings (06 §6.8)", () => {
  it('M2.2-E14 kvwebui.home is a full page id; title and home are preset-only; theme is global only', async () => {
    await expect(start({ 'kvwebui.home': 'notes' })).rejects.toMatchObject(problem('VALIDATION_FAILED'));
    const kernel = await start({ 'kvwebui.home': 'notes.list' });
    const settings = await kernel.exec('kernel.settings.list', {});
    const byKey = new Map(settings.map((setting) => [setting.key, setting]));
    expect(byKey.get('kvwebui.title')).toMatchObject({ value: 'kvwebui.title.default', scopes: [], source: 'default' });
    expect(byKey.get('kvwebui.home')).toMatchObject({ value: 'notes.list', scopes: [], source: 'preset' });
    expect(byKey.get('kvwebui.theme')).toMatchObject({ value: 'system', scopes: ['global'] });
    expect(byKey.get('kvwebui.nav.order')).toMatchObject({ value: [], scopes: ['global', 'workspace'] });
    expect(byKey.get('kvwebui.nav.hidden')).toMatchObject({ value: [], scopes: ['global', 'workspace'] });
    await expect(kernel.exec('kernel.settings.set', { key: 'kvwebui.theme', value: 'dark', scope: 'workspace' })).rejects.toMatchObject(problem('VALIDATION_FAILED'));
    await expect(kernel.exec('kernel.settings.set', { key: 'kvwebui.title', value: 'x.y', scope: 'global' })).rejects.toMatchObject(problem('VALIDATION_FAILED'));
    await expect(kernel.exec('kernel.settings.set', { key: 'kvwebui.home', value: 'notes.other', scope: 'global' })).rejects.toMatchObject(problem('VALIDATION_FAILED'));
    await kernel.exec('kernel.settings.set', { key: 'kvwebui.nav.order', value: ['notes.list'], scope: 'workspace' });
    expect((await kernel.exec('kernel.settings.list', {})).find((setting) => setting.key === 'kvwebui.nav.order')).toMatchObject({ value: ['notes.list'], source: 'workspace' });
  });

  it('QA52-H1 kvwebui starts without a home page set, on the Extensions page', async () => {
    const kernel = await start(undefined);
    const home = (await kernel.exec('kernel.settings.list', {})).find((setting) => setting.key === 'kvwebui.home');
    expect(home).toMatchObject({ value: 'kvwebui.extensions', scopes: [], source: 'default' });
  });

  it("QA52-E1 a preset still names its own home, which stays preset-only", async () => {
    const kernel = await start({ 'kvwebui.home': 'notes.list' });
    const home = (await kernel.exec('kernel.settings.list', {})).find((setting) => setting.key === 'kvwebui.home');
    expect(home).toMatchObject({ value: 'notes.list', source: 'preset' });
    await expect(kernel.exec('kernel.settings.set', { key: 'kvwebui.home', value: 'notes.other', scope: 'global' })).rejects.toMatchObject(problem('VALIDATION_FAILED'));
  });

  it('QA52-E15 the hidden status items and the workspace picker are preset-only', async () => {
    const kernel = await start(undefined);
    const byKey = new Map((await kernel.exec('kernel.settings.list', {})).map((setting) => [setting.key, setting]));
    expect(byKey.get('kvwebui.status.hidden')).toMatchObject({ value: [], scopes: [], source: 'default' });
    expect(byKey.get('kvwebui.workspacePicker')).toMatchObject({ value: true, scopes: [], source: 'default' });
    await expect(kernel.exec('kernel.settings.set', { key: 'kvwebui.status.hidden', value: ['kvai.usage'], scope: 'global' })).rejects.toMatchObject(problem('VALIDATION_FAILED'));
    await expect(kernel.exec('kernel.settings.set', { key: 'kvwebui.workspacePicker', value: false, scope: 'global' })).rejects.toMatchObject(problem('VALIDATION_FAILED'));
  });
});
