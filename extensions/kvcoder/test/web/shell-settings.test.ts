import { flushPromises } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import ShellSettings from '../../web/src/ShellSettings.vue';
import { createFakeKvman, type FakeKvman } from './support/fake-kvman.ts';
import { mounted } from './support/fixtures.ts';
import { serveSettings, settingWrites, type ScopedValues } from './support/settings-world.ts';

const approvalKey = 'kvcoder.shell.approval';
const pathKey = 'kvcoder.shell.path';

function world(values: { approval?: Partial<ScopedValues>; path?: Partial<ScopedValues> } = {}, fail = false): FakeKvman {
  const fake = createFakeKvman();
  serveSettings(fake, { [approvalKey]: { default: 'auto', ...values.approval }, [pathKey]: { default: null, ...values.path } }, fail);
  return fake;
}

type Wrapper = Awaited<ReturnType<typeof mounted>>;
const select = (view: Wrapper) => view.find('[data-test="shell-approval-control"]');
const field = (view: Wrapper) => view.find('[data-test="shell-path-control"]');
const valueOf = (control: ReturnType<typeof select>) => (control.element as HTMLSelectElement | HTMLInputElement).value;

async function pick(view: Wrapper, value: string): Promise<void> {
  await select(view).setValue(value);
  await flushPromises();
}

async function type(view: Wrapper, text: string, end: 'enter' | 'blur'): Promise<void> {
  await field(view).setValue(text);
  await (end === 'enter' ? field(view).trigger('keydown', { key: 'Enter' }) : field(view).trigger('blur'));
  await flushPromises();
}

describe("the shell connector's settings in its dialog (08 §8.7, ADR 0020, 2 and 13)", () => {
  it('QA28-H3 a choice saves as it changes, and the row says Saved and Changed with a reset', async () => {
    const fake = world();
    const view = await mounted(ShellSettings, fake);
    expect(select(view).findAll('option').map((option) => option.text())).toEqual(['Ask only for risky calls', 'Ask for every call']);
    expect(valueOf(select(view))).toBe('auto');
    expect(view.find('[data-test="shell-approval-changed"]').exists()).toBe(false);
    await pick(view, 'ask');
    expect(settingWrites(fake)).toEqual([{ name: 'kernel.settings.set', input: { key: approvalKey, value: 'ask', scope: 'global' } }]);
    expect(view.find('[data-test="shell-approval-saved"]').text()).toBe('Saved');
    expect(view.find('[data-test="shell-approval-changed"]').text()).toBe('Changed');
    expect(view.find('[data-test="shell-approval-reset"]').text()).toBe('Reset');
    expect(view.find('[data-test="shell-path-saved"]').exists()).toBe(false);
  });

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

  it("QA28-H5 a change is saved into the page's scope, and the workspace's value resets to the one for all workspaces", async () => {
    const fake = world({ approval: { global: 'ask' } });
    fake.scope.value = 'workspace';
    const view = await mounted(ShellSettings, fake);
    expect(valueOf(select(view))).toBe('ask');
    expect(view.find('[data-test="shell-approval-changed"]').exists()).toBe(false);
    await pick(view, 'auto');
    expect(view.find('[data-test="shell-approval-changed"]').text()).toBe('Changed for notes-app');
    expect(view.find('[data-test="shell-approval-reset"]').text()).toBe('Use the value for all workspaces');
    await view.find('[data-test="shell-approval-reset"]').trigger('click');
    await flushPromises();
    expect(settingWrites(fake)).toEqual([{ name: 'kernel.settings.set', input: { key: approvalKey, value: 'auto', scope: 'workspace' } }, { name: 'kernel.settings.reset', input: { key: approvalKey, scope: 'workspace' } }]);
    expect(valueOf(select(view))).toBe('ask');
    expect(view.find('[data-test="shell-approval-changed"]').exists()).toBe(false);
  });

  it("QA28-E1 a workspace's own value can't be edited from All workspaces", async () => {
    const fake = world({ approval: { workspace: 'ask' }, path: { workspace: '/bin/fish' } });
    const view = await mounted(ShellSettings, fake);
    expect([valueOf(select(view)), select(view).attributes('disabled')]).toEqual(['ask', '']);
    expect([valueOf(field(view)), field(view).attributes('disabled')]).toEqual(['/bin/fish', '']);
    expect(view.find('[data-test="shell-approval-own-value"]').text()).toBe('notes-app has its own value. Switch to notes-app to change it.');
    expect(view.find('[data-test="shell-approval-reset"]').exists()).toBe(false);
    fake.scope.value = 'workspace';
    await flushPromises();
    expect(select(view).attributes('disabled')).toBeUndefined();
    expect(view.find('[data-test="shell-approval-changed"]').text()).toBe('Changed for notes-app');
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
    expect(view.find('[data-test="shell-approval-title"]').text()).toBe(fake.kvman.t('kvcoder.shell.approval.title'));
    expect(view.find('[data-test="shell-approval-title"]').text()).not.toBe('Shell approval');
    expect(field(view).attributes('dir')).toBe('ltr');
    expect(field(view).attributes('placeholder')).toBe('يُعثر عليه تلقائيًا');
  });
});
