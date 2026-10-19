import { flushPromises } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import ApprovalSetting from '../../web/src/ApprovalSetting.vue';
import { createFakeKvman, type FakeKvman } from './support/fake-kvman.ts';
import { mounted } from './support/fixtures.ts';
import { serveSettings, settingWrites, type ScopedValues } from './support/settings-world.ts';

const key = 'kvcoder.approval';

function world(values: Partial<ScopedValues> = {}): FakeKvman {
  const fake = createFakeKvman();
  serveSettings(fake, { [key]: { default: 'auto', ...values } });
  return fake;
}

type Wrapper = Awaited<ReturnType<typeof mounted>>;
const select = (view: Wrapper) => view.find('[data-test="approval-setting-control"]');
const shown = (view: Wrapper): string => (select(view).element as HTMLSelectElement).value;
const confirm = (view: Wrapper) => view.find('[data-test="approval-never-confirm"]');

async function pick(view: Wrapper, value: string): Promise<void> {
  await select(view).setValue(value);
  await flushPromises();
}

async function press(view: Wrapper, name: string): Promise<void> {
  await view.find(`[data-test="${name}"]`).trigger('click');
  await flushPromises();
}

describe("the approval setting in kvcoder's configuration (08 §8.7, ADR 0077)", () => {
  it('QA28-H3 and M2.4-E296 it has three choices, and auto or ask saves as it changes with Saved, Changed, and a reset', async () => {
    const fake = world();
    const view = await mounted(ApprovalSetting, fake);
    expect(view.find('[data-test="approval-setting-title"]').text()).toBe('Approval');
    expect(select(view).findAll('option').map((option) => option.text())).toEqual(['Ask only for risky calls', 'Ask for every call', 'Never ask']);
    expect(shown(view)).toBe('auto');
    await pick(view, 'ask');
    expect(confirm(view).exists()).toBe(false);
    expect(settingWrites(fake)).toEqual([{ name: 'kernel.settings.set', input: { key, value: 'ask', scope: 'global' } }]);
    expect(view.find('[data-test="approval-setting-saved"]').text()).toBe('Saved');
    expect(view.find('[data-test="approval-setting-changed"]').text()).toBe('Changed');
    expect(view.find('[data-test="approval-setting-reset"]').text()).toBe('Reset');
    expect(view.find('[data-test="approval-mode"]').text()).toBe(fake.kvman.t('kvcoder.ui.approvalNote.ask'));
  });

  it('M2.4-E297 choosing Never ask saves nothing and asks first, saying what it means', async () => {
    const fake = world();
    const view = await mounted(ApprovalSetting, fake);
    await pick(view, 'never');
    expect(settingWrites(fake)).toEqual([]);
    expect([confirm(view).attributes('role'), confirm(view).attributes('aria-label')]).toEqual(['alertdialog', 'Never ask before a call?']);
    expect(view.find('[data-test="approval-never-text"]').text()).toBe('The agent will run commands, change files, change kvman itself, and start worker programs without asking you. What it reads can steer it.');
    expect([view.find('[data-test="approval-never-cancel"]').text(), view.find('[data-test="approval-never-yes"]').text()]).toEqual(['Cancel', 'Turn off asking']);
    expect(shown(view)).toBe('never');
    expect(view.find('[data-test="approval-mode"]').text()).toBe(fake.kvman.t('kvcoder.ui.approvalNote.auto'));
  });

  it('M2.4-E298 Cancel and Escape close the confirmation, write nothing, and show the stored choice again', async () => {
    const fake = world({ global: 'ask' });
    const view = await mounted(ApprovalSetting, fake);
    await pick(view, 'never');
    await press(view, 'approval-never-cancel');
    expect([confirm(view).exists(), shown(view)]).toEqual([false, 'ask']);
    await pick(view, 'never');
    await confirm(view).trigger('keydown', { key: 'Escape' });
    expect([confirm(view).exists(), shown(view)]).toEqual([false, 'ask']);
    expect(settingWrites(fake)).toEqual([]);
  });

  it("M2.4-E299 Turn off asking saves never into the page's scope, and the note says nothing asks", async () => {
    const fake = world();
    fake.scope.value = 'workspace';
    const view = await mounted(ApprovalSetting, fake);
    await pick(view, 'never');
    await press(view, 'approval-never-yes');
    expect(settingWrites(fake)).toEqual([{ name: 'kernel.settings.set', input: { key, value: 'never', scope: 'workspace' } }]);
    expect([confirm(view).exists(), shown(view)]).toEqual([false, 'never']);
    expect(view.find('[data-test="approval-setting-changed"]').text()).toBe('Changed for notes-app');
    const note = view.find('[data-test="approval-mode"]');
    expect(note.text()).toBe(fake.kvman.t('kvcoder.ui.approvalNote.never'));
    expect(note.text()).toContain('requests no approval');
    expect(note.text()).toContain("The agent's own questions to you still wait for your answer.");
    await press(view, 'approval-setting-reset');
    expect(settingWrites(fake).at(-1)).toEqual({ name: 'kernel.settings.reset', input: { key, scope: 'workspace' } });
    expect(shown(view)).toBe('auto');
  });

  it("QA28-E1 a workspace's own choice can't be edited from All workspaces", async () => {
    const fake = world({ workspace: 'never' });
    const view = await mounted(ApprovalSetting, fake);
    expect([shown(view), select(view).attributes('disabled')]).toEqual(['never', '']);
    expect(view.find('[data-test="approval-setting-own-value"]').text()).toBe('notes-app has its own value. Switch to notes-app to change it.');
    expect(view.find('[data-test="approval-setting-reset"]').exists()).toBe(false);
  });

  it('QA28-E5 in Arabic the title, the choices, and the confirmation are translated', async () => {
    const fake = world();
    fake.language.value = 'ar';
    const view = await mounted(ApprovalSetting, fake);
    expect(view.find('[data-test="approval-setting-title"]').text()).toBe('الموافقة');
    expect(select(view).findAll('option').map((option) => option.text()).at(-1)).toBe('لا تسأل أبدًا');
    await pick(view, 'never');
    expect(view.find('[data-test="approval-never-yes"]').text()).toBe('أوقف السؤال');
  });
});

describe('the approval rules under the Approval row (08 §8.7, ADR 0091, 1)', () => {
  it('QA59-H7 lists the rules and Remove writes the list without one', async () => {
    const fake = createFakeKvman();
    const rules = [{ kind: 'line', prefix: 'pnpm exec' }, { kind: 'files' }];
    serveSettings(fake, { [key]: { default: 'auto' }, 'kvcoder.approval.allowed': { default: [], global: rules } });
    const view = await mounted(ApprovalSetting, fake);
    expect(view.findAll('[data-test="approval-rule-text"]').map((row) => row.text())).toEqual(['Always allowed: pnpm exec …', 'Always allowed: file changes']);
    await view.findAll('[data-test="approval-rule-remove"]')[0]?.trigger('click');
    await flushPromises();
    expect(settingWrites(fake)).toEqual([{ name: 'kernel.settings.set', input: { key: 'kvcoder.approval.allowed', value: [{ kind: 'files' }], scope: 'global' } }]);
  });

  it('QA59-H7 says when no command is always allowed', async () => {
    const fake = createFakeKvman();
    serveSettings(fake, { [key]: { default: 'auto' }, 'kvcoder.approval.allowed': { default: [] } });
    const view = await mounted(ApprovalSetting, fake);
    expect(view.find('[data-test="approval-rules-none"]').text()).toBe('No commands are always allowed.');
  });
});
