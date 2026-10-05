import { flushPromises } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import { mcpServersSchema } from '../../src/mcp/servers.ts';
import McpServers from '../../web/src/McpServers.vue';
import { draftProblems, type ServerDraft } from '../../web/src/mcp-server-entry.ts';
import { mounted } from './support/fixtures.ts';
import { changes, github, linear, mcpWorld } from './support/mcp-world.ts';

type Wrapper = Awaited<ReturnType<typeof mounted>>;
const field = (view: Wrapper, name: string) => view.find(`[data-test="mcp-${name}"]`);
const problem = (view: Wrapper, name: string) => view.find(`[data-test="mcp-${name}-error"]`);

async function addValue(view: Wrapper, name: string, value: string): Promise<void> {
  await field(view, 'value-add').trigger('click');
  await view.findAll('[data-test="mcp-value-name"]').at(-1)?.setValue(name);
  await view.findAll('[data-test="mcp-value-secret"]').at(-1)?.setValue(value);
}

async function save(view: Wrapper): Promise<void> {
  await view.find('[data-test="mcp-form"]').trigger('submit');
  await flushPromises();
}

const secretSet = (name: string, value: string) => ({ name: 'kernel.secrets.set', input: { extension: '@kvman/kvcoder', name, value } });
const listSet = (value: unknown, scope = 'global') => ({ name: 'kernel.settings.set', input: { key: 'kvcoder.mcp.servers', value, scope } });

describe('adding and editing an MCP server (08 §8.7, ADR 0020, 6 and 15)', () => {
  it("QA29-H12 a command server is saved: the list in the page's scope, then its value as a secret, then the check", async () => {
    const { fake } = mcpWorld({}, { checks: { github: { status: 'ready', tools: 8 } } });
    fake.scope.value = 'workspace';
    const view = await mounted(McpServers, fake);
    await field(view, 'add').trigger('click');
    await field(view, 'name').setValue('github');
    await field(view, 'description').setValue('Issues and pull requests.');
    await field(view, 'command').setValue('npx');
    await field(view, 'args').setValue('-y\nserver-github\n');
    await addValue(view, 'TOKEN', 'ghp_secret');
    await save(view);
    expect(changes(fake)).toEqual([listSet([github], 'workspace'), secretSet('mcp.github.env.TOKEN', 'ghp_secret')]);
    const order = fake.calls.map((call) => call.name).filter((name) => ['kernel.settings.set', 'kernel.secrets.set', 'kvcoder.mcp.server.check'].includes(name));
    expect(order).toEqual(['kernel.settings.set', 'kernel.secrets.set', 'kvcoder.mcp.server.check']);
    expect(view.find('[data-test="mcp-server-github"] [data-test="mcp-server-state"]').text()).toContain('Ready · 8 tools');
    expect(fake.toast.mock.calls).toEqual([['kvcoder.config.mcp.saved', { name: 'github' }, 'success']]);
    expect(view.html()).not.toContain('ghp_secret');
  });

  it("QA29-H13 a URL server asks for the URL and headers, and stores each header's value as its secret", async () => {
    const { fake } = mcpWorld({ global: [github] }, { checks: { github: { status: 'ready', tools: 8 }, linear: { status: 'signInNeeded' } } });
    const view = await mounted(McpServers, fake);
    await field(view, 'add').trigger('click');
    expect(field(view, 'url').exists()).toBe(false);
    await field(view, 'kind-url').setValue(true);
    expect([field(view, 'command').exists(), field(view, 'args').exists(), field(view, 'value-add').text()]).toEqual([false, false, 'Add a header']);
    await field(view, 'name').setValue('linear');
    await field(view, 'description').setValue('The team tracker.');
    await field(view, 'url').setValue('https://mcp.linear.app/mcp');
    await addValue(view, 'Authorization', 'Bearer abc');
    await save(view);
    expect(changes(fake)).toEqual([listSet([github, linear]), secretSet('mcp.linear.header.Authorization', 'Bearer abc')]);
  });

  it('QA29-H14 editing keeps what is not changed: the name is fixed, a stored value shows Set, and only a replaced or removed one is written', async () => {
    const { fake, secrets } = mcpWorld({ global: [{ ...github, env: ['TOKEN', 'ORG'] }] }, { secrets: ['mcp.github.env.TOKEN', 'mcp.github.env.ORG'], checks: { github: { status: 'ready', tools: 8 } } });
    const view = await mounted(McpServers, fake);
    await field(view, 'server-edit').trigger('click');
    expect(field(view, 'form-title').text()).toBe('Edit github');
    expect(field(view, 'name').attributes('disabled')).toBe('');
    expect(view.findAll('[data-test="mcp-value-set"]').map((chip) => chip.text())).toEqual(['Set', 'Set']);
    expect(view.findAll('[data-test="mcp-value-secret"]')).toHaveLength(0);
    await field(view, 'description').setValue('Only issues.');
    await save(view);
    expect(changes(fake)).toEqual([listSet([{ ...github, description: 'Only issues.', env: ['TOKEN', 'ORG'] }])]);

    await field(view, 'server-edit').trigger('click');
    await view.findAll('[data-test="mcp-value-replace"]')[0]?.trigger('click');
    await field(view, 'value-secret').setValue('ghp_new');
    await view.findAll('[data-test="mcp-value-remove"]')[1]?.trigger('click');
    await save(view);
    expect(changes(fake).slice(1)).toEqual([listSet([{ ...github, description: 'Only issues.' }]), secretSet('mcp.github.env.TOKEN', 'ghp_new'), { name: 'kernel.secrets.delete', input: { extension: '@kvman/kvcoder', name: 'mcp.github.env.ORG' } }]);
    expect([...secrets]).toEqual(['mcp.github.env.TOKEN']);
  });

  it('QA29-E22 what the list would refuse shows under its field, and nothing is written', async () => {
    const { fake } = mcpWorld({ global: [github] }, { checks: { github: { status: 'ready', tools: 8 } } });
    const view = await mounted(McpServers, fake);
    await field(view, 'add').trigger('click');
    await save(view);
    expect([problem(view, 'name').text(), problem(view, 'description').text(), problem(view, 'command').text()]).toEqual(['Give the server a name.', 'Say what the server is for.', 'Give the command that starts the server.']);
    for (const [name, text] of [['My Server', 'Use lowercase letters, digits, and dashes, starting with a letter.'], ['github', 'Another server has this name.']] as const) {
      await field(view, 'name').setValue(name);
      await save(view);
      expect(problem(view, 'name').text()).toBe(text);
    }
    await field(view, 'value-add').trigger('click');
    await save(view);
    expect(problem(view, 'values').text()).toBe("A variable's name has letters, digits, and _, and doesn't start with a digit.");
    await field(view, 'value-name').setValue('TOKEN');
    await save(view);
    expect(problem(view, 'values').text()).toBe('Give each new name a value, or remove its row.');
    await addValue(view, 'TOKEN', 'x');
    await save(view);
    expect(problem(view, 'values').text()).toBe('Each name can be given once.');
    await field(view, 'kind-url').setValue(true);
    await field(view, 'url').setValue('ftp://files.example.com');
    await save(view);
    expect(problem(view, 'url').text()).toBe('Give an address that starts with http:// or https://.');
    await addValue(view, 'Bad Header:', 'x');
    await save(view);
    expect(problem(view, 'values').text()).toBe("A header's name has no spaces and no colon.");
    expect(changes(fake)).toEqual([]);
  });

  it("QA29-E22 the form's rules are the setting's: a draft the form accepts is a list the server accepts", () => {
    const base: ServerDraft = { name: 'github', description: 'x', kind: 'command', command: 'npx', args: '', url: '', values: [{ name: 'A_1', value: 'v', set: false, replacing: false }] };
    const drafts: [ServerDraft, unknown][] = [
      [base, { name: 'github', description: 'x', command: 'npx', args: [], env: ['A_1'] }],
      [{ ...base, name: 'Git' }, { name: 'Git', description: 'x', command: 'npx', args: [], env: [] }],
      [{ ...base, values: [{ name: '1A', value: 'v', set: false, replacing: false }] }, { name: 'github', description: 'x', command: 'npx', args: [], env: ['1A'] }],
      [{ ...base, kind: 'url', url: 'https://a.example/mcp', values: [] }, { name: 'github', description: 'x', url: 'https://a.example/mcp', headers: [] }],
      [{ ...base, kind: 'url', url: 'file:///x', values: [] }, { name: 'github', description: 'x', url: 'file:///x', headers: [] }],
      [{ ...base, kind: 'url', url: 'https://a.example', values: [{ name: 'X Y', value: 'v', set: false, replacing: false }] }, { name: 'github', description: 'x', url: 'https://a.example', headers: ['X Y'] }],
    ];
    for (const [draft, entry] of drafts) expect(Object.keys(draftProblems(draft, [])).length === 0, JSON.stringify(entry)).toBe(mcpServersSchema.safeParse([entry]).success);
  });

  it('QA29-E25 a save that fails is toasted and the form stays open with what was typed', async () => {
    const { fake } = mcpWorld({}, { failSet: true });
    const view = await mounted(McpServers, fake);
    await field(view, 'add').trigger('click');
    await field(view, 'name').setValue('github');
    await field(view, 'description').setValue('Issues.');
    await field(view, 'command').setValue('npx');
    await addValue(view, 'TOKEN', 'ghp_secret');
    await save(view);
    expect(fake.toast.mock.calls).toEqual([['kernel.errors.VALIDATION_FAILED', {}, 'error']]);
    expect((field(view, 'command').element as HTMLInputElement).value).toBe('npx');
    expect(fake.calls.filter((call) => call.name === 'kernel.secrets.set')).toEqual([]);
  });

  it('QA29-E26 a value is typed into a password field, and the dialog reads names only, never a value', async () => {
    const { fake } = mcpWorld({ global: [github] }, { secrets: ['mcp.github.env.TOKEN'], checks: { github: { status: 'ready', tools: 8 } } });
    const view = await mounted(McpServers, fake);
    await field(view, 'server-edit').trigger('click');
    await field(view, 'value-add').trigger('click');
    const secret = field(view, 'value-secret');
    expect([secret.attributes('type'), secret.attributes('autocomplete')]).toEqual(['password', 'off']);
    expect(new Set(fake.calls.map((call) => call.name))).toEqual(new Set(['kernel.settings.list', 'kernel.secrets.list', 'kvcoder.mcp.server.check']));
  });
});
