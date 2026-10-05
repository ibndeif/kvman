import { flushPromises } from '@vue/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ProblemError } from '@kvman/sdk';
import McpServers from '../../web/src/McpServers.vue';
import McpSignIn from '../../web/src/McpSignIn.vue';
import { createFakeKvman } from './support/fake-kvman.ts';
import { mounted } from './support/fixtures.ts';
import { changes, github, linear, mcpWorld } from './support/mcp-world.ts';

afterEach(() => {
  vi.unstubAllGlobals();
  window.history.replaceState(null, '', '/');
});

type Wrapper = Awaited<ReturnType<typeof mounted>>;
const row = (view: Wrapper, name: string) => view.find(`[data-test="mcp-server-${name}"]`);

async function page(search: string, finish: (input: Record<string, unknown>) => unknown) {
  window.history.replaceState(null, '', `/kvcoder/mcp-sign-in${search}`);
  const fake = createFakeKvman();
  fake.handle('kvcoder.mcp.sign-in.finish', finish);
  const view = await mounted(McpSignIn, fake);
  await flushPromises();
  return { fake, view };
}

describe("signing in to an MCP server from its row, and kvcoder's sign-in page (08 §8.7, ADR 0020, 8 and 11)", () => {
  it('QA30-H7 the page hands the code and state of its address to kvcoder, once, and says the person is signed in', async () => {
    const { fake, view } = await page('?code=c-1&state=s-1', () => ({ name: 'linear' }));
    expect(fake.calls).toEqual([{ name: 'kvcoder.mcp.sign-in.finish', input: { state: 's-1', code: 'c-1' } }]);
    expect(view.find('[data-test="mcp-sign-in"]').attributes('data-outcome')).toBe('done');
    expect(view.find('[data-test="mcp-sign-in"]').text()).toBe('Signed in to linear.You can close this tab.');
  });

  it('QA30-E9 an address with an error, or without a code or a state, runs nothing and says the sign-in did not finish', async () => {
    for (const search of ['?error=access_denied&state=s-1', '?state=s-1', '?code=c-1', '?code=c-1&state=s-1&error=server_error', '']) {
      const { fake, view } = await page(search, () => ({ name: 'linear' }));
      expect(fake.calls, search).toEqual([]);
      expect(view.find('[data-test="mcp-sign-in-title"]').text(), search).toBe("The sign-in didn't finish");
      expect(view.find('[data-test="mcp-sign-in-reason"]').text(), search).toBe('The server sent no code: the sign-in was cancelled or refused.');
      view.unmount();
    }
  });

  it("QA30-E10 a finish that fails shows the Problem's sentence", async () => {
    const { view } = await page('?code=c-1&state=old', () => {
      throw new ProblemError({ code: 'kvcoder/MCP_SIGN_IN_FAILED', message: 'x', params: { reason: 'it took more than 10 minutes' } });
    });
    expect(view.find('[data-test="mcp-sign-in"]').attributes('data-outcome')).toBe('failed');
    expect(view.find('[data-test="mcp-sign-in-reason"]').text()).toBe("The sign-in didn't work: it took more than 10 minutes");
  });

  it('QA30-H8 Sign in starts the sign-in for this page, opens the address in a new tab, and checks again when the window has the focus back', async () => {
    const { fake } = mcpWorld({ global: [linear] }, { checks: { linear: { status: 'signInNeeded' } } });
    fake.handle('kvcoder.mcp.sign-in.start', () => ({ url: 'https://auth.linear.app/authorize?state=s-1' }));
    const tab = { opener: {} as unknown };
    const open = vi.fn(() => tab);
    vi.stubGlobal('open', open);
    const view = await mounted(McpServers, fake);
    await flushPromises();
    expect(row(view, 'linear').find('[data-test="mcp-server-state"]').text()).toContain('Sign-in needed');
    await row(view, 'linear').find('[data-test="mcp-server-sign-in"]').trigger('click');
    await flushPromises();
    expect(fake.calls.find((call) => call.name === 'kvcoder.mcp.sign-in.start')?.input).toEqual({ name: 'linear', redirectUrl: `${window.location.origin}/kvcoder/mcp-sign-in` });
    expect(open.mock.calls).toEqual([['https://auth.linear.app/authorize?state=s-1', '_blank']]);
    expect(tab.opener).toBeNull();

    fake.handle('kvcoder.mcp.server.check', () => ({ status: 'ready', tools: 8 }));
    fake.handle('kernel.secrets.list', () => [{ extension: '@kvman/kvcoder', name: 'mcp.linear.oauth.tokens' }]);
    window.dispatchEvent(new Event('focus'));
    await flushPromises();
    expect(row(view, 'linear').find('[data-test="mcp-server-state"]').text()).toContain('Ready · 8 tools');
    expect(row(view, 'linear').find('[data-test="mcp-server-sign-in"]').exists()).toBe(false);
    expect(row(view, 'linear').find('[data-test="mcp-server-sign-out"]').text()).toBe('Sign out');
    view.unmount();
  });

  it('QA30-H9 Sign out deletes the sign-in secrets of that server only, and checks it again', async () => {
    const stored = ['mcp.linear.oauth.tokens', 'mcp.linear.oauth.client', 'mcp.linear.header.Authorization', 'mcp.other.oauth.tokens'];
    const { fake, secrets } = mcpWorld({ global: [linear] }, { secrets: stored, checks: { linear: { status: 'ready', tools: 8 } } });
    const view = await mounted(McpServers, fake);
    await flushPromises();
    await row(view, 'linear').find('[data-test="mcp-server-sign-out"]').trigger('click');
    await flushPromises();
    expect(changes(fake).map((call) => [call.name, call.input['name']])).toEqual([['kernel.secrets.delete', 'mcp.linear.oauth.tokens'], ['kernel.secrets.delete', 'mcp.linear.oauth.client']]);
    expect([...secrets]).toEqual(['mcp.linear.header.Authorization', 'mcp.other.oauth.tokens']);
    expect(fake.calls.filter((call) => call.name === 'kvcoder.mcp.server.check')).toHaveLength(2);
    expect(row(view, 'linear').find('[data-test="mcp-server-sign-out"]').exists()).toBe(false);
  });

  it('QA30-E11 a start that fails is toasted and opens no tab; a blocked tab says so', async () => {
    const { fake } = mcpWorld({ global: [linear] }, { checks: { linear: { status: 'signInNeeded' } } });
    fake.handle('kvcoder.mcp.sign-in.start', () => {
      throw new ProblemError({ code: 'kvcoder/MCP_SIGN_IN_FAILED', message: 'x', params: { reason: 'no registration' } });
    });
    const open = vi.fn(() => null);
    vi.stubGlobal('open', open);
    const view = await mounted(McpServers, fake);
    await flushPromises();
    await row(view, 'linear').find('[data-test="mcp-server-sign-in"]').trigger('click');
    await flushPromises();
    expect(open).not.toHaveBeenCalled();
    expect(fake.toast.mock.calls).toEqual([['kvcoder.errors.MCP_SIGN_IN_FAILED', { reason: 'no registration' }, 'error']]);
    fake.handle('kvcoder.mcp.sign-in.start', () => ({ url: 'https://auth.linear.app/authorize' }));
    await row(view, 'linear').find('[data-test="mcp-server-sign-in"]').trigger('click');
    await flushPromises();
    expect(fake.toast.mock.calls.at(-1)).toEqual(['kvcoder.config.mcp.signIn.blocked', {}, 'warning']);
  });

  it('QA30-E12 a command server has no sign-in, whatever its state and secrets', async () => {
    const { fake } = mcpWorld({ global: [github] }, { secrets: ['mcp.github.oauth.tokens'], checks: { github: { status: 'signInNeeded' } } });
    const view = await mounted(McpServers, fake);
    await flushPromises();
    expect([row(view, 'github').find('[data-test="mcp-server-sign-in"]').exists(), row(view, 'github').find('[data-test="mcp-server-sign-out"]').exists()]).toEqual([false, false]);
  });
});
