import { describe, expect, it } from 'vitest';
import { ProblemError } from '@kvman/sdk';
import { builtinConnectors } from '../../src/connector-call.ts';
import ConnectorsList from '../../web/src/ConnectorsList.vue';
import { ownConnectors } from '../../web/src/use-connectors.ts';
import ar from '../../locales/ar.json' with { type: 'json' };
import en from '../../locales/en.json' with { type: 'json' };
import { createFakeKvman, type FakeKvman } from './support/fake-kvman.ts';
import { mounted } from './support/fixtures.ts';

const key = 'kvcoder.connectors.disabled';
const todo = { name: 'todo', description: 'Keep a todo list.', owner: '@test/todo', kind: 'commands', enabled: true };
const gh = { name: 'gh', description: 'GitHub CLI.', owner: 'kvcoder.connectors', kind: 'binary', enabled: true };

// kvman's settings as the kernel keeps them for one key: a value per scope, and the one in effect.
function world(values: { global?: string[]; workspace?: string[] } = {}, fail = false): FakeKvman {
  const fake = createFakeKvman();
  fake.handle('kvcoder.connector.list', () => [todo, gh]);
  fake.handle('kernel.settings.list', () => [{ key, value: values.workspace ?? values.global ?? [], source: values.workspace !== undefined ? 'workspace' : values.global !== undefined ? 'global' : 'default' }]);
  fake.handle('kernel.settings.set', (input) => {
    if (fail) throw new ProblemError({ code: 'VALIDATION_FAILED', message: 'Not valid.' });
    values[input['scope'] === 'workspace' ? 'workspace' : 'global'] = input['value'] as string[];
    return {};
  });
  fake.handle('kernel.settings.reset', (input) => {
    delete values[input['scope'] === 'workspace' ? 'workspace' : 'global'];
    return {};
  });
  return fake;
}

const writes = (fake: FakeKvman) => fake.calls.filter((call) => call.name.startsWith('kernel.settings.') && call.name !== 'kernel.settings.list');

describe("the connectors list of kvcoder's configuration (08 §8.7, ADR 0014, 10)", () => {
  it('QA22-H2 and QA28-H1 the connectors are one list: a name, a description, and a switch each, a cog only on shell, and nothing about where one comes from', async () => {
    const list = await mounted(ConnectorsList, world());
    expect(list.findAll('.kvc-connector').map((row) => row.find('[data-test="connector-name"]').text())).toEqual(['shell', 'fs', 'artifact', 'background', 'ask', 'subagent', 'todo', 'gh']);
    expect(list.findAll('.kvc-connector').map((row) => row.findAll('[data-test]').map((part) => part.attributes('data-test')))).toEqual([['connector-name', 'connector-description', 'connector-configure', 'connector-switch'], ...Array.from({ length: 7 }, () => ['connector-name', 'connector-description', 'connector-switch'])]);
    expect(list.find('[data-test="connector-gh"] [data-test="connector-description"]').text()).toBe('GitHub CLI.');
    expect(list.text()).not.toContain('@test/todo');
    const cog = list.find('[data-test="connector-shell"] [data-test="connector-configure"]');
    expect([cog.attributes('aria-label'), cog.attributes('aria-haspopup')]).toEqual(['Configure shell', 'dialog']);
  });

  it('QA21-H11 the list shows the six own connectors and the added ones, each on, and turning one off writes the setting', async () => {
    const fake = world();
    const list = await mounted(ConnectorsList, fake);
    expect(list.findAll('.kvc-connector').map((row) => [row.find('[data-test="connector-name"]').text(), row.find('[data-test="connector-switch"]').attributes('aria-checked')])).toEqual([
      ['shell', 'true'],
      ['fs', 'true'],
      ['artifact', 'true'],
      ['background', 'true'],
      ['ask', 'true'],
      ['subagent', 'true'],
      ['todo', 'true'],
      ['gh', 'true'],
    ]);
    expect(list.find('[data-test="connector-ask"] [data-test="connector-description"]').text()).toBe('Asks you a question and waits for your answer.');
    expect(list.find('[data-test="connector-todo"] [data-test="connector-description"]').text()).toBe('Keep a todo list.');
    expect(list.find('[data-test="connector-shell"] [data-test="connector-switch"]').attributes('aria-label')).toBe('Use shell');
    await list.find('[data-test="connector-shell"] [data-test="connector-switch"]').trigger('click');
    await list.vm.$nextTick();
    expect(writes(fake)).toEqual([{ name: 'kernel.settings.set', input: { key, value: ['shell'], scope: 'global' } }]);
    await expect.poll(() => list.find('[data-test="connector-shell"] [data-test="connector-switch"]').attributes('aria-checked')).toBe('false');
    expect(list.find('[data-test="connectors-changed"]').text()).toBe('Changed');
  });

  it("QA21-H12 the list writes in the page's scope, and shows Changed with a reset for a list set there", async () => {
    const fake = world();
    fake.scope.value = 'workspace';
    const list = await mounted(ConnectorsList, fake);
    expect(list.find('[data-test="connectors-changed"]').exists()).toBe(false);
    await list.find('[data-test="connector-todo"] [data-test="connector-switch"]').trigger('click');
    await expect.poll(() => list.find('[data-test="connectors-changed"]').exists()).toBe(true);
    expect(list.find('[data-test="connectors-changed"]').text()).toBe('Changed for notes-app');
    expect(list.find('[data-test="connectors-reset"]').text()).toBe('Use the list for all workspaces');
    await list.find('[data-test="connectors-reset"]').trigger('click');
    await expect.poll(() => list.find('[data-test="connectors-changed"]').exists()).toBe(false);
    expect(writes(fake)).toEqual([{ name: 'kernel.settings.set', input: { key, value: ['todo'], scope: 'workspace' } }, { name: 'kernel.settings.reset', input: { key, scope: 'workspace' } }]);
    expect(list.find('[data-test="connector-todo"] [data-test="connector-switch"]').attributes('aria-checked')).toBe('true');
  });

  it("QA21-E10 a workspace's own list can't be edited from All workspaces", async () => {
    const fake = world({ workspace: ['fs'] });
    const list = await mounted(ConnectorsList, fake);
    expect(list.find('[data-test="connectors-own-value"]').text()).toBe('notes-app has its own list. Switch to notes-app to change it.');
    expect(list.findAll('[data-test="connector-switch"]').every((button) => button.attributes('disabled') !== undefined)).toBe(true);
    expect(list.find('[data-test="connector-fs"] [data-test="connector-switch"]').attributes('aria-checked')).toBe('false');
    fake.scope.value = 'workspace';
    await expect.poll(() => list.find('[data-test="connectors-own-value"]').exists()).toBe(false);
    expect(list.find('[data-test="connector-fs"] [data-test="connector-switch"]').attributes('disabled')).toBeUndefined();
    expect(list.find('[data-test="connectors-changed"]').text()).toBe('Changed for notes-app');
  });

  it("QA28-E3 the cog opens the dialog while a workspace's own list locks the switches", async () => {
    const list = await mounted(ConnectorsList, world({ workspace: ['fs'] }));
    expect(list.find('[data-test="connector-shell"] [data-test="connector-switch"]').attributes('disabled')).toBe('');
    expect(list.find('[data-test="connector-shell"] [data-test="connector-configure"]').attributes('disabled')).toBeUndefined();
    await list.find('[data-test="connector-shell"] [data-test="connector-configure"]').trigger('click');
    expect(list.find('[data-test="connector-dialog"]').exists()).toBe(true);
  });

  it("QA21-E11 turning one on keeps the names the list doesn't show", async () => {
    const fake = world({ global: ['gone', 'fs'] });
    const list = await mounted(ConnectorsList, fake);
    await list.find('[data-test="connector-fs"] [data-test="connector-switch"]').trigger('click');
    await expect.poll(() => writes(fake)).toEqual([{ name: 'kernel.settings.set', input: { key, value: ['gone'], scope: 'global' } }]);
  });

  it('QA21-E12 a rejected change keeps the switch and shows the Problem', async () => {
    const fake = world({}, true);
    const list = await mounted(ConnectorsList, fake);
    await list.find('[data-test="connector-ask"] [data-test="connector-switch"]').trigger('click');
    await expect.poll(() => fake.toast.mock.calls).toEqual([['kernel.errors.VALIDATION_FAILED', {}, 'error']]);
    expect(list.find('[data-test="connector-ask"] [data-test="connector-switch"]').attributes('aria-checked')).toBe('true');
    expect(list.find('[data-test="connector-ask"] [data-test="connector-switch"]').attributes('disabled')).toBeUndefined();
  });

  it("QA21-E13 the list names kvcoder's own connectors, each described in en and ar", () => {
    expect([...ownConnectors]).toEqual([...builtinConnectors]);
    const catalogs: Record<string, Record<string, string>> = { en, ar };
    for (const [language, catalog] of Object.entries(catalogs)) {
      expect(ownConnectors.filter((name) => (catalog[`kvcoder.config.connector.${name}`] ?? '') === ''), language).toEqual([]);
    }
  });
});
