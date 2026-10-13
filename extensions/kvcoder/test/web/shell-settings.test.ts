import { flushPromises } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import ShellSettings from '../../web/src/ShellSettings.vue';
import { createFakeKvman, type FakeKvman } from './support/fake-kvman.ts';
import { mounted } from './support/fixtures.ts';
import { serveSettings, settingWrites, type ScopedValues } from './support/settings-world.ts';

const pathKey = 'kvcoder.shell.path';

function world(values: { path?: Partial<ScopedValues> } = {}, fail = false): FakeKvman {
  const fake = createFakeKvman();
  serveSettings(fake, { [pathKey]: { default: null, ...values.path } }, fail);
  return fake;
}

type Wrapper = Awaited<ReturnType<typeof mounted>>;
const field = (view: Wrapper) => view.find('[data-test="shell-path-control"]');
const valueOf = (control: ReturnType<typeof field>) => (control.element as HTMLInputElement).value;

async function type(view: Wrapper, text: string, end: 'enter' | 'blur'): Promise<void> {
  await field(view).setValue(text);
  await (end === 'enter' ? field(view).trigger('keydown', { key: 'Enter' }) : field(view).trigger('blur'));
  await flushPromises();
}

describe("the shell connector's setting in its dialog (08 §8.7, ADR 0020, 2 and 13; ADR 0077, 6)", () => {
  it('QA28-H4 the shell program saves on Enter and on leaving the field; empty is null, and an unchanged field writes nothing', async () => {
    const fake = world();
    const view = await mounted(ShellSettings, fake);
    expect(field(view).attributes('placeholder')).toBe('Found automatically');
    await type(view, '', 'blur');
    expect(settingWrites(fake)).toEqual([]);
    await type(view, ' /bin/zsh ', 'enter');
    expect(valueOf(field(view))).toBe('/bin/zsh');
    expect(view.find('[data-test="shell-path-saved"]').text()).toBe('Saved');
    await type(view, '/bin/zsh', 'blur');
    await type(view, '', 'blur');
    expect(settingWrites(fake).map((call) => call.input)).toEqual([{ key: pathKey, value: '/bin/zsh', scope: 'global' }, { key: pathKey, value: null, scope: 'global' }]);
  });

  it("QA28-H5 and QA28-E1 the shell program is saved into the page's scope, and a workspace's own value can't be edited from All workspaces", async () => {
    const fake = world({ path: { workspace: '/bin/fish' } });
    const view = await mounted(ShellSettings, fake);
    expect([valueOf(field(view)), field(view).attributes('disabled')]).toEqual(['/bin/fish', '']);
    expect(view.find('[data-test="shell-path-own-value"]').text()).toBe('notes-app has its own value. Switch to notes-app to change it.');
    fake.scope.value = 'workspace';
    await flushPromises();
    expect(field(view).attributes('disabled')).toBeUndefined();
    await type(view, '/bin/zsh', 'enter');
    expect(settingWrites(fake)).toEqual([{ name: 'kernel.settings.set', input: { key: pathKey, value: '/bin/zsh', scope: 'workspace' } }]);
    expect(view.find('[data-test="shell-path-changed"]').text()).toBe('Changed for notes-app');
  });

  it('QA28-E2 a change that fails is toasted, the row says nothing was saved, and the field shows the stored value', async () => {
    const fake = world({ path: { global: '/bin/bash' } }, true);
    const view = await mounted(ShellSettings, fake);
    await type(view, '/nowhere', 'enter');
    expect(fake.toast.mock.calls).toEqual([['kernel.errors.VALIDATION_FAILED', {}, 'error']]);
    expect(view.find('[data-test="shell-path-saved"]').exists()).toBe(false);
    expect(valueOf(field(view))).toBe('/bin/bash');
  });

  it('QA28-E5 in Arabic the texts are translated and the shell program stays left to right', async () => {
    const fake = world();
    fake.language.value = 'ar';
    const view = await mounted(ShellSettings, fake);
    expect(view.find('[data-test="shell-path-title"]').text()).toBe(fake.kvman.t('kvcoder.shell.path.title'));
    expect(view.find('[data-test="shell-path-title"]').text()).not.toBe('Shell program');
    expect(field(view).attributes('dir')).toBe('ltr');
    expect(field(view).attributes('placeholder')).toBe('يُعثر عليه تلقائيًا');
  });
});
