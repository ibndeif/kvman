import { flushPromises } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import DelegateWorkers from '../../web/src/DelegateWorkers.vue';
import type { ClaudeEntry, OpencodeEntry, PiEntry, WorkerEntry } from '../../web/src/worker-entry.ts';
import { createFakeKvman, type FakeKvman } from './support/fake-kvman.ts';
import { mounted } from './support/fixtures.ts';
import { serveSettings, settingWrites } from './support/settings-world.ts';

const key = 'kvcoder.delegate.workers';
const general: WorkerEntry = { name: 'general', description: 'Any separate task', enabled: true, kind: 'subagent', instructions: '', connectors: null, model: null, thinking: null };
const coder: OpencodeEntry = { name: 'coder', description: 'Writes code from a brief', enabled: true, kind: 'opencode', instructions: 'Be exact.', approval: 'ask', timeoutMs: 1_800_000, model: 'zai/glm', agent: 'build', autoApprove: false };

// kvman as the delegate dialog sees it, with each program's check answered from `found`.
function world(list: WorkerEntry[], found: Record<string, 'ready' | 'notFound'> = {}): FakeKvman {
  const fake = createFakeKvman();
  serveSettings(fake, { [key]: { default: [], global: list } });
  fake.handle('kvai.provider.list', () => []);
  fake.handle('kvai.model.list', () => []);
  fake.handle('kvcoder.connector.list', () => []);
  fake.handle('kvcoder.delegate.worker.check', (input) => ({ status: found[String(input['name'])] ?? 'ready' }));
  return fake;
}

type Wrapper = Awaited<ReturnType<typeof mounted>>;
const part = (view: Wrapper, name: string) => view.find(`[data-test="${name}"]`);
const lastWritten = (fake: FakeKvman): unknown => (settingWrites(fake).at(-1)?.input['value'] as unknown[]).at(-1);

async function add(view: Wrapper, kind: string, fields: Record<string, string>): Promise<void> {
  await part(view, 'worker-add').trigger('click');
  await flushPromises();
  await part(view, 'worker-kind-select').setValue(kind);
  for (const [name, value] of Object.entries({ 'worker-name': kind === 'claude' ? 'cc' : kind, 'worker-description': 'Does work', ...fields })) await part(view, name).setValue(value);
}
const submit = async (view: Wrapper): Promise<void> => {
  await part(view, 'worker-form').trigger('submit');
  await flushPromises();
};

describe("the program kinds in the delegate connector's dialog (08 §8.7, ADR 0021, 13 and 38)", () => {
  it('QA32-H12 the form writes an opencode, a pi, and a Claude Code entry, with empty fields as null', async () => {
    const fake = world([general]);
    const view = await mounted(DelegateWorkers, fake);
    await flushPromises();
    await add(view, 'opencode', { 'worker-instructions': 'Be exact.', 'worker-minutes': '45', 'worker-program-model': 'zai/glm', 'worker-agent': 'build' });
    expect(view.findAll('[data-test="worker-kind-select"] option').map((option) => option.text())).toEqual(['Subagent', 'opencode', 'pi', 'Claude Code']);
    await part(view, 'worker-approval-auto').setValue(true);
    await part(view, 'worker-auto-approve').setValue(false);
    await submit(view);
    const opencode: OpencodeEntry = { name: 'opencode', description: 'Does work', enabled: true, kind: 'opencode', instructions: 'Be exact.', approval: 'auto', timeoutMs: 2_700_000, model: 'zai/glm', agent: 'build', autoApprove: false };
    expect(lastWritten(fake)).toEqual(opencode);

    await add(view, 'pi', { 'worker-tools': 'read\n\n bash ', 'worker-pi-thinking': 'xhigh' });
    await submit(view);
    const pi: PiEntry = { name: 'pi', description: 'Does work', enabled: true, kind: 'pi', instructions: '', approval: 'ask', timeoutMs: 1_800_000, model: null, thinking: 'xhigh', tools: ['read', 'bash'] };
    expect(lastWritten(fake)).toEqual(pi);

    await add(view, 'claude', {});
    await submit(view);
    const claude: ClaudeEntry = { name: 'cc', description: 'Does work', enabled: true, kind: 'claude', instructions: '', approval: 'ask', timeoutMs: 1_800_000, model: null, effort: null, permissionMode: 'acceptEdits' };
    expect(lastWritten(fake)).toEqual(claude);
    expect(view.findAll('[data-test="worker-kind"]').map((chip) => chip.text())).toEqual(['Subagent', 'opencode', 'pi', 'Claude Code']);
  });

  it("QA32-H13 Edit shows a program worker's values with Kind fixed, and nothing of a subagent's", async () => {
    const fake = world([general, coder]);
    const view = await mounted(DelegateWorkers, fake);
    await flushPromises();
    await part(view, 'worker-coder').find('[data-test="worker-edit"]').trigger('click');
    await flushPromises();
    const kind = part(view, 'worker-kind-select').element as HTMLSelectElement;
    expect([kind.value, kind.disabled]).toEqual(['opencode', true]);
    expect((part(view, 'worker-approval-ask').element as HTMLInputElement).checked).toBe(true);
    expect(['worker-minutes', 'worker-program-model', 'worker-agent'].map((name) => (part(view, name).element as HTMLInputElement).value)).toEqual(['30', 'zai/glm', 'build']);
    expect((part(view, 'worker-auto-approve').element as HTMLInputElement).checked).toBe(false);
    for (const absent of ['worker-connectors-all', 'worker-model', 'worker-thinking', 'worker-tools', 'worker-effort']) expect(part(view, absent).exists(), absent).toBe(false);
    await part(view, 'worker-agent').setValue('');
    await submit(view);
    expect(lastWritten(fake)).toEqual({ ...coder, agent: null });
  });

  it('QA32-H14 a program row says Checking…, then nothing or that the program was not found, with Check again', async () => {
    const answers: ((status: { status: string }) => void)[] = [];
    const fake = world([general, coder]);
    fake.handle('kvcoder.delegate.worker.check', () => new Promise((resolve) => answers.push(resolve)));
    const view = await mounted(DelegateWorkers, fake);
    await flushPromises();
    const state = () => part(view, 'worker-coder').find('[data-test="worker-state"]');
    expect(state().text()).toBe('Checking…');
    expect(part(view, 'worker-general').find('[data-test="worker-state"]').exists()).toBe(false);
    answers[0]?.({ status: 'notFound' });
    await flushPromises();
    expect(state().text()).toBe('opencode not found Check again');
    await part(view, 'worker-check').trigger('click');
    expect(state().text()).toBe('Checking…');
    answers[1]?.({ status: 'ready' });
    await flushPromises();
    expect(state().exists()).toBe(false);
    expect(fake.calls.filter((call) => call.name === 'kvcoder.delegate.worker.check').map((call) => call.input['name'])).toEqual(['coder', 'coder']);
  });

  it('QA32-E21 Start at once with its own approval on, or with a mode that asks nobody, shows under Before a run, and nothing is written', async () => {
    const fake = world([general]);
    const view = await mounted(DelegateWorkers, fake);
    await flushPromises();
    await add(view, 'opencode', {});
    await part(view, 'worker-approval-auto').setValue(true);
    await submit(view);
    expect(part(view, 'worker-approval-error').text()).toBe('A worker that starts at once can\'t also approve its own actions. Choose "Ask me", or a stricter setting below.');
    expect(settingWrites(fake)).toEqual([]);
    await part(view, 'worker-kind-select').setValue('claude');
    await part(view, 'worker-permission-mode').setValue('bypassPermissions');
    await submit(view);
    expect(part(view, 'worker-approval-error').exists()).toBe(true);
    expect(settingWrites(fake)).toEqual([]);
    await part(view, 'worker-approval-ask').setValue(true);
    await submit(view);
    expect(lastWritten(fake)).toMatchObject({ kind: 'claude', approval: 'ask', permissionMode: 'bypassPermissions' });
  });

  it.each(['0', '121', '2.5', 'ten', ''])('QA32-E18 a time limit of "%s" minutes shows under its field, and nothing is written', async (minutes) => {
    const fake = world([general]);
    const view = await mounted(DelegateWorkers, fake);
    await flushPromises();
    await add(view, 'pi', { 'worker-minutes': minutes });
    await submit(view);
    expect(part(view, 'worker-minutes-error').text()).toBe('Give a whole number of minutes from 1 to 120.');
    expect(settingWrites(fake)).toEqual([]);
    await part(view, 'worker-minutes').setValue('120');
    await submit(view);
    expect(lastWritten(fake)).toMatchObject({ kind: 'pi', timeoutMs: 7_200_000 });
  });
});
