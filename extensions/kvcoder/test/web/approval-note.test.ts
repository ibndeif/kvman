import { flushPromises } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import ApprovalNote from '../../web/src/ApprovalNote.vue';
import ChatStart from '../../web/src/ChatStart.vue';
import ShellSettings from '../../web/src/ShellSettings.vue';
import { createFakeKvman, type FakeKvman } from './support/fake-kvman.ts';
import { mounted } from './support/fixtures.ts';
import { serveSettings } from './support/settings-world.ts';

const key = 'kvcoder.shell.approval';

function approvalFake(value: unknown, fail = false): FakeKvman {
  const fake = createFakeKvman();
  if (fail) fake.handle('kernel.settings.list', () => Promise.reject(Object.assign(new Error('Gone.'), { problem: { code: 'NOT_FOUND', message: 'Gone.', params: {} } })));
  else fake.handle('kernel.settings.list', () => [{ key, value, source: 'global' }]);
  return fake;
}

describe('the effective approval note (KVC-22)', () => {
  it('loading says checking, never the default auto', async () => {
    const fake = createFakeKvman();
    fake.handle('kernel.settings.list', () => new Promise<never>(() => {}));
    const view = await mounted(ApprovalNote, fake, { withLink: true });
    expect(view.find('[data-test="approval-loading"]').text()).toBe(fake.kvman.t('kvcoder.ui.approvalNote.loading'));
    expect(view.find('[data-test="approval-mode"]').exists()).toBe(false);
    expect(view.find('[data-test="approval-note"]').text()).not.toContain('risky');
    view.unmount();
  });

  it('auto says the model marks risky, risky:false may run, registered asks still ask, plus no-sandboxing limits and the Coder configuration link', async () => {
    const fake = approvalFake('auto');
    const view = await mounted(ApprovalNote, fake, { withLink: true });
    expect(view.find('[data-test="approval-mode"]').text()).toBe(fake.kvman.t('kvcoder.ui.approvalNote.auto'));
    expect(view.find('[data-test="approval-mode"]').text()).toContain('MCP tool calls');
    expect(view.find('[data-test="approval-limits"]').text()).toBe(fake.kvman.t('kvcoder.ui.approvalNote.limits'));
    await view.find('[data-test="approval-config"]').trigger('click');
    expect(fake.navigate).toHaveBeenCalledWith('kvwebui.extension', { namespace: 'kvcoder' });
    view.unmount();
  });

  it('ask describes effectful shell and file calls without promising all commands ask', async () => {
    const fake = approvalFake('ask');
    const view = await mounted(ApprovalNote, fake);
    expect(view.find('[data-test="approval-mode"]').text()).toBe(fake.kvman.t('kvcoder.ui.approvalNote.ask'));
    expect(view.find('[data-test="approval-mode"]').text()).toContain('MCP tool calls');
    expect(view.find('[data-test="approval-mode"]').text()).toContain('reads and help do not all require approval');
    expect(view.find('[data-test="approval-mode"]').text()).not.toContain('every command');
    expect(view.find('[data-test="approval-config"]').exists()).toBe(false);
    view.unmount();
  });

  it('failure is honest with a retry that loads, and scope/workspace changes reload', async () => {
    let calls = 0;
    const fake = createFakeKvman();
    fake.handle('kernel.settings.list', () => {
      calls += 1;
      if (calls === 1) return Promise.reject(Object.assign(new Error('Gone.'), { problem: { code: 'NOT_FOUND', message: 'Gone.', params: {} } }));
      return [{ key, value: 'ask', source: 'global' }];
    });
    const view = await mounted(ApprovalNote, fake);
    expect(view.find('[data-test="approval-failed"]').exists()).toBe(true);
    expect(view.find('[data-test="approval-mode"]').exists()).toBe(false);
    await view.find('[data-test="approval-retry"]').trigger('click');
    await flushPromises();
    expect(view.find('[data-test="approval-mode"]').text()).toBe(fake.kvman.t('kvcoder.ui.approvalNote.ask'));
    const before = calls;
    fake.scope.value = 'workspace';
    await flushPromises();
    expect(calls).toBeGreaterThan(before);
    view.unmount();
  });

  it('the initial chat and the shell dialog reuse the same note', async () => {
    const chatFake = createFakeKvman();
    chatFake.handle('kernel.settings.list', () => [{ key, value: 'auto', source: 'global' }, { key: 'kvcoder.model', value: null }, { key: 'kvai.defaultModel', value: 'fake/m1' }, { key: 'kvcoder.thinking', value: 'medium' }]);
    chatFake.handle('kvai.provider.list', () => [{ id: 'fake', title: 'Fake', status: 'ready' }]);
    chatFake.handle('kvai.model.list', () => [{ id: 'fake/m1', name: 'M1', provider: 'fake' }]);
    chatFake.handle('kvcoder.session.create', () => ({ id: 's9' }));
    chatFake.handle('kvcoder.session.configure', () => ({}));
    chatFake.handle('kvcoder.message.send', () => ({}));
    const chat = await mounted(ChatStart, chatFake);
    expect(chat.find('[data-test="approval-note"]').exists()).toBe(true);
    expect(chat.find('[data-test="approval-mode"]').text()).toBe(chatFake.kvman.t('kvcoder.ui.approvalNote.auto'));
    chat.unmount();

    const shellFake = createFakeKvman();
    serveSettings(shellFake, { [key]: { default: 'ask' }, 'kvcoder.shell.path': { default: null } });
    const shell = await mounted(ShellSettings, shellFake);
    expect(shell.find('[data-test="approval-note"]').exists()).toBe(true);
    expect(shell.find('[data-test="approval-mode"]').text()).toBe(shellFake.kvman.t('kvcoder.ui.approvalNote.ask'));
    shell.unmount();
  });
});
