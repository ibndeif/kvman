import { flushPromises } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import DelegateWorkers from '../../web/src/DelegateWorkers.vue';
import type { WorkerEntry } from '../../web/src/worker-entry.ts';
import { createFakeKvman, type FakeKvman } from './support/fake-kvman.ts';
import { mounted } from './support/fixtures.ts';
import { serveSettings, settingWrites, type ScopedValues } from './support/settings-world.ts';

const key = 'kvcoder.delegate.workers';
const entry = (name: string, fields: Partial<WorkerEntry> = {}): WorkerEntry => ({ name, description: `The ${name} worker`, enabled: true, kind: 'subagent', instructions: '', connectors: null, model: null, thinking: null, ...fields });
const general = entry('general', { description: 'Any separate, self-contained task' });
const reviewer = entry('reviewer', { description: 'Reviews changes with a fresh look', instructions: 'You are a code reviewer.', connectors: ['fs', 'todo'], model: 'zed/z1', thinking: 'high' });

// kvman as the delegate dialog sees it: the workers setting, the models, and the added connectors.
function world(values: Partial<ScopedValues> = {}, failSet = false): FakeKvman {
  const fake = createFakeKvman();
  serveSettings(fake, { [key]: { default: [general, reviewer], ...values } }, failSet);
  fake.handle('kvai.provider.list', () => [{ id: 'zed', title: 'Zed AI', status: 'ready' }]);
  fake.handle('kvai.model.list', () => [{ id: 'zed/z1', name: 'Z1', provider: 'zed' }]);
  fake.handle('kvcoder.connector.list', () => [{ name: 'todo', description: 'Keep a todo list.', owner: '@test/todo', kind: 'commands', enabled: true }]);
  return fake;
}

type Wrapper = Awaited<ReturnType<typeof mounted>>;
const row = (view: Wrapper, name: string) => view.find(`[data-test="worker-${name}"]`);
const part = (view: Wrapper, name: string) => view.find(`[data-test="${name}"]`);
const written = (fake: FakeKvman) => settingWrites(fake).map((call) => call.input);

async function fill(view: Wrapper, fields: Record<string, string>): Promise<void> {
  for (const [name, value] of Object.entries(fields)) await part(view, `worker-${name}`).setValue(value);
}

describe("the delegate connector's workers in its dialog (08 §8.7, ADR 0021, 6, 7, and 30)", () => {
  it('QA31-H12 the dialog lists the workers: a name, a description, a kind, a switch, Edit, and Remove each, and Add a worker', async () => {
    const view = await mounted(DelegateWorkers, world({ global: [general, { ...reviewer, enabled: false }] }));
    await flushPromises();
    expect(view.findAll('[data-test="worker-name"]').map((name) => name.text())).toEqual(['general', 'reviewer']);
    expect(row(view, 'reviewer').find('[data-test="worker-description"]').text()).toBe('Reviews changes with a fresh look');
    expect(row(view, 'reviewer').find('[data-test="worker-kind"]').text()).toBe('Subagent');
    expect(view.findAll('[data-test="worker-switch"]').map((control) => [control.attributes('aria-checked'), control.attributes('aria-label')])).toEqual([['true', 'Use general'], ['false', 'Use reviewer']]);
    expect(row(view, 'reviewer').find('[data-test="worker-edit"]').attributes('aria-label')).toBe('Edit reviewer');
    expect(row(view, 'general').find('[data-test="worker-remove"]').attributes('aria-label')).toBe('Remove general');
    expect(part(view, 'worker-add').text()).toBe('Add a worker');
  });

  it('QA31-H13 a switch writes the same list with that worker turned off, in the scope of the page', async () => {
    const fake = world();
    fake.scope.value = 'workspace';
    const view = await mounted(DelegateWorkers, fake);
    await flushPromises();
    await row(view, 'reviewer').find('[data-test="worker-switch"]').trigger('click');
    await flushPromises();
    expect(written(fake)).toEqual([{ key, value: [general, { ...reviewer, enabled: false }], scope: 'workspace' }]);
    expect(row(view, 'reviewer').find('[data-test="worker-switch"]').attributes('aria-checked')).toBe('false');
  });

  it('QA31-H14 adding a worker writes the list with the new entry last, and says so', async () => {
    const fake = world();
    const view = await mounted(DelegateWorkers, fake);
    await flushPromises();
    await part(view, 'worker-add').trigger('click');
    await flushPromises();
    expect(part(view, 'worker-form-title').text()).toBe('Add a worker');
    await fill(view, { name: 'writer', description: 'Writes the docs', instructions: 'You write docs.', thinking: 'low' });
    await part(view, 'worker-connectors-some').setValue(true);
    expect(view.findAll('[data-test^="worker-connector-"]').map((box) => box.attributes('data-test'))).toEqual(['shell', 'fs', 'artifact', 'background', 'ask', 'mcp', 'todo'].map((name) => `worker-connector-${name}`));
    await part(view, 'worker-connector-fs').setValue(true);
    await part(view, 'worker-model').find('[data-test="model-picker"]').trigger('click');
    await part(view, 'worker-model').find('[data-test="model-zed/z1"]').trigger('click');
    await part(view, 'worker-form').trigger('submit');
    await flushPromises();
    const writer = { name: 'writer', description: 'Writes the docs', enabled: true, kind: 'subagent', instructions: 'You write docs.', connectors: ['fs'], model: 'zed/z1', thinking: 'low' };
    expect(written(fake)).toEqual([{ key, value: [general, reviewer, writer], scope: 'global' }]);
    expect(fake.toast.mock.calls).toEqual([['kvcoder.config.workers.saved', { name: 'writer' }, 'success']]);
    expect(view.findAll('[data-test="worker-name"]').map((name) => name.text())).toEqual(['general', 'reviewer', 'writer']);
  });

  it("QA31-H15 Edit shows the worker's values with its name fixed, and All and Same as the chat store null", async () => {
    const fake = world();
    const view = await mounted(DelegateWorkers, fake);
    await flushPromises();
    await row(view, 'reviewer').find('[data-test="worker-edit"]').trigger('click');
    await flushPromises();
    expect(part(view, 'worker-form-title').text()).toBe('Edit reviewer');
    const name = part(view, 'worker-name').element as HTMLInputElement;
    expect([name.value, name.disabled]).toEqual(['reviewer', true]);
    expect((part(view, 'worker-instructions').element as HTMLTextAreaElement).value).toBe('You are a code reviewer.');
    expect(['fs', 'todo', 'shell'].map((connector) => (part(view, `worker-connector-${connector}`).element as HTMLInputElement).checked)).toEqual([true, true, false]);
    expect(part(view, 'worker-model').find('[data-test="model-picker"]').text()).toBe('Z1');
    expect((part(view, 'worker-thinking').element as HTMLSelectElement).value).toBe('high');
    await part(view, 'worker-connectors-all').setValue(true);
    await part(view, 'worker-thinking').setValue('');
    await part(view, 'worker-model').find('[data-test="model-picker"]').trigger('click');
    expect(part(view, 'worker-model').find('[data-test="model-none-entry"]').text()).toBe('Same as the chat');
    await part(view, 'worker-model').find('[data-test="model-none-entry"]').trigger('click');
    await part(view, 'worker-form').trigger('submit');
    await flushPromises();
    expect(written(fake)).toEqual([{ key, value: [general, { ...reviewer, connectors: null, model: null, thinking: null }], scope: 'global' }]);
  });

  it('QA31-H16 Remove asks first; confirmed, it writes the list without the worker', async () => {
    const fake = world();
    const view = await mounted(DelegateWorkers, fake);
    await flushPromises();
    await row(view, 'general').find('[data-test="worker-remove"]').trigger('click');
    expect(row(view, 'general').find('[data-test="worker-remove-confirm"]').text()).toContain('Remove general?');
    await row(view, 'general').find('[data-test="worker-remove-cancel"]').trigger('click');
    expect(written(fake)).toEqual([]);
    await row(view, 'general').find('[data-test="worker-remove"]').trigger('click');
    await row(view, 'general').find('[data-test="worker-remove-yes"]').trigger('click');
    await flushPromises();
    expect(written(fake)).toEqual([{ key, value: [reviewer], scope: 'global' }]);
    expect(fake.toast.mock.calls).toEqual([['kvcoder.config.workers.removed', { name: 'general' }, 'success']]);
  });

  it('QA31-E14 a name that is taken or misshapen, no description, or no connector ticked shows under its field, and nothing is written', async () => {
    const fake = world();
    const view = await mounted(DelegateWorkers, fake);
    await flushPromises();
    await part(view, 'worker-add').trigger('click');
    await flushPromises();
    await part(view, 'worker-connectors-some').setValue(true);
    await part(view, 'worker-form').trigger('submit');
    expect(part(view, 'worker-name-error').text()).toBe('Give the worker a name.');
    expect(part(view, 'worker-description-error').text()).toBe('Say what the worker is for.');
    expect(part(view, 'worker-connectors-error').text()).toBe('Tick at least one connector, or choose All.');
    await fill(view, { name: 'Big_Name', description: 'x' });
    await part(view, 'worker-form').trigger('submit');
    expect(part(view, 'worker-name-error').text()).toBe('Use lowercase letters, digits, and dashes, starting with a letter.');
    await fill(view, { name: 'reviewer', instructions: 'x'.repeat(16 * 1024 + 1) });
    await part(view, 'worker-form').trigger('submit');
    expect(part(view, 'worker-name-error').text()).toBe('Another worker has this name.');
    expect(part(view, 'worker-instructions-error').text()).toBe('The instructions are longer than 16 KB.');
    expect(written(fake)).toEqual([]);
  });

  it("QA31-E15 a workspace's own list is read-only from All workspaces", async () => {
    const view = await mounted(DelegateWorkers, world({ global: [general], workspace: [reviewer] }));
    await flushPromises();
    expect(part(view, 'workers-own-value').text()).toBe('notes-app has its own list. Switch to notes-app to change it.');
    expect(view.findAll('[data-test="worker-name"]').map((name) => name.text())).toEqual(['reviewer']);
    for (const control of ['worker-add', 'worker-edit', 'worker-remove', 'worker-switch']) expect(part(view, control).attributes('disabled'), control).toBe('');
  });

  it('QA31-E16 a list set in the scope being edited shows Changed, and the reset brings the shipped list back', async () => {
    const fake = world({ global: [reviewer] });
    const view = await mounted(DelegateWorkers, fake);
    await flushPromises();
    expect(part(view, 'workers-changed').text()).toBe('Changed');
    await part(view, 'workers-reset').trigger('click');
    await flushPromises();
    expect(written(fake)).toEqual([{ key, scope: 'global' }]);
    expect(view.findAll('[data-test="worker-name"]').map((name) => name.text())).toEqual(['general', 'reviewer']);
    expect(part(view, 'workers-changed').exists()).toBe(false);
  });

  it('QA31-E17 with no worker the dialog says so', async () => {
    const view = await mounted(DelegateWorkers, world({ global: [] }));
    await flushPromises();
    expect(part(view, 'workers-empty').text()).toBe('No workers yet. Add one and the agent can hand it a task.');
    expect(view.findAll('[data-test="worker-name"]')).toHaveLength(0);
  });
});
