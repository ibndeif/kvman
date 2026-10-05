import { flushPromises } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import McpServers from '../../web/src/McpServers.vue';
import { mounted } from './support/fixtures.ts';
import { changes, failed, github, linear, mcpWorld } from './support/mcp-world.ts';

type Wrapper = Awaited<ReturnType<typeof mounted>>;
const row = (view: Wrapper, name: string) => view.find(`[data-test="mcp-server-${name}"]`);
const stateOf = (view: Wrapper, name: string) => row(view, name).find('[data-test="mcp-server-state"]');

describe("the mcp connector's servers in its dialog (08 §8.7, ADR 0020, 9, 14, and 15)", () => {
  it('QA29-H11 the dialog lists the servers and checks each: ready with its tools, or could not connect with the reason', async () => {
    const { fake } = mcpWorld({ global: [github, linear] }, { checks: { github: { status: 'ready', tools: 8 }, linear: failed } });
    const view = await mounted(McpServers, fake);
    await flushPromises();
    expect(view.findAll('[data-test="mcp-server-name"]').map((name) => name.text())).toEqual(['github', 'linear']);
    expect(row(view, 'github').find('[data-test="mcp-server-description"]').text()).toBe('Issues and pull requests.');
    expect([stateOf(view, 'github').attributes('data-status'), stateOf(view, 'github').text()]).toEqual(['ready', 'Ready · 8 tools Check again']);
    expect([stateOf(view, 'linear').attributes('data-status'), stateOf(view, 'linear').text()]).toEqual(['failed', 'Could not connect Check again']);
    expect(row(view, 'linear').find('[data-test="mcp-server-reason"]').text()).toBe('The MCP server linear failed: connect ECONNREFUSED');
    expect(fake.calls.filter((call) => call.name === 'kvcoder.mcp.server.check').map((call) => call.input['name'])).toEqual(['github', 'linear']);
  });

  it('QA29-H11 a row says Checking… until its check answers, and Check again checks it once more', async () => {
    let answer = (check: unknown): void => void check;
    const { fake } = mcpWorld({ global: [github] });
    fake.handle('kvcoder.mcp.server.check', () => new Promise((resolve) => (answer = resolve)));
    const view = await mounted(McpServers, fake);
    expect([stateOf(view, 'github').attributes('data-status'), stateOf(view, 'github').text()]).toEqual(['checking', 'Checking…']);
    answer({ status: 'signInNeeded' });
    await flushPromises();
    expect(stateOf(view, 'github').text()).toBe('Sign-in needed Check again');
    await row(view, 'github').find('[data-test="mcp-server-check"]').trigger('click');
    expect(stateOf(view, 'github').text()).toBe('Checking…');
    expect(fake.calls.filter((call) => call.name === 'kvcoder.mcp.server.check')).toHaveLength(2);
  });

  it('QA29-H15 Remove asks first; confirmed, it writes the list without the server and deletes every secret of its', async () => {
    const { fake, secrets } = mcpWorld({ global: [github, linear] }, { secrets: ['mcp.github.env.TOKEN', 'mcp.github.oauth.tokens', 'mcp.linear.header.Authorization', 'other.key'], checks: { github: { status: 'ready', tools: 1 }, linear: failed } });
    const view = await mounted(McpServers, fake);
    await row(view, 'github').find('[data-test="mcp-server-remove"]').trigger('click');
    expect(row(view, 'github').find('[data-test="mcp-remove-confirm"]').text()).toContain('Remove github and its secrets?');
    await row(view, 'github').find('[data-test="mcp-remove-cancel"]').trigger('click');
    expect(changes(fake)).toEqual([]);
    await row(view, 'github').find('[data-test="mcp-server-remove"]').trigger('click');
    await row(view, 'github').find('[data-test="mcp-remove-yes"]').trigger('click');
    await flushPromises();
    expect(changes(fake)).toEqual([
      { name: 'kernel.settings.set', input: { key: 'kvcoder.mcp.servers', value: [linear], scope: 'global' } },
      { name: 'kernel.secrets.delete', input: { extension: '@kvman/kvcoder', name: 'mcp.github.env.TOKEN' } },
      { name: 'kernel.secrets.delete', input: { extension: '@kvman/kvcoder', name: 'mcp.github.oauth.tokens' } },
    ]);
    expect([...secrets]).toEqual(['mcp.linear.header.Authorization', 'other.key']);
    expect(view.findAll('[data-test="mcp-server-name"]').map((name) => name.text())).toEqual(['linear']);
    expect(fake.toast.mock.calls).toEqual([['kvcoder.config.mcp.removed', { name: 'github' }, 'success']]);
  });

  it("QA29-E23 a workspace's own list is read-only from All workspaces, and editable from the workspace", async () => {
    const { fake } = mcpWorld({ global: [linear], workspace: [github] }, { checks: { github: { status: 'ready', tools: 2 } } });
    const view = await mounted(McpServers, fake);
    await flushPromises();
    expect(view.find('[data-test="mcp-own-value"]').text()).toBe('notes-app has its own list. Switch to notes-app to change it.');
    expect(view.findAll('[data-test="mcp-server-name"]').map((name) => name.text())).toEqual(['github']);
    for (const control of ['mcp-add', 'mcp-server-edit', 'mcp-server-remove']) expect(view.find(`[data-test="${control}"]`).attributes('disabled'), control).toBe('');
    fake.scope.value = 'workspace';
    await flushPromises();
    expect(view.find('[data-test="mcp-add"]').attributes('disabled')).toBeUndefined();
    expect(view.find('[data-test="mcp-changed"]').text()).toBe('Changed for notes-app');
    await view.find('[data-test="mcp-reset"]').trigger('click');
    await flushPromises();
    expect(changes(fake)).toEqual([{ name: 'kernel.settings.reset', input: { key: 'kvcoder.mcp.servers', scope: 'workspace' } }]);
  });

  it('QA29-E24 with no servers the dialog says so and offers to add one', async () => {
    const { fake } = mcpWorld();
    const view = await mounted(McpServers, fake);
    expect(view.find('[data-test="mcp-empty"]').text()).toBe('No servers yet. Add one and the agent can use its tools.');
    await view.find('[data-test="mcp-add"]').trigger('click');
    expect(view.find('[data-test="mcp-form-title"]').text()).toBe('Add an MCP server');
    await view.find('[data-test="mcp-cancel"]').trigger('click');
    expect(view.find('[data-test="mcp-empty"]').exists()).toBe(true);
  });
});
