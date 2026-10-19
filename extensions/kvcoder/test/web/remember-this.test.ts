import { flushPromises } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import MessageItem from '../../web/src/MessageItem.vue';
import { createFakeKvman } from './support/fake-kvman.ts';
import { answer, message, mounted, user } from './support/fixtures.ts';
import { serveSettings, settingWrites, type ScopedValues } from './support/settings-world.ts';

// "Remember this" on a message the person sent (08 §8.7, ADR 0092, 3).
async function remembered(values: ScopedValues, text: string, fail = false) {
  const fake = createFakeKvman();
  serveSettings(fake, { 'kvcoder.preferences': values }, fail);
  const view = await mounted(MessageItem, fake, { message: user(text, { source: { kind: 'user' } }), calls: new Map() });
  await view.find('[data-test="remember-this"]').trigger('click');
  return { fake, view };
}

describe('Remember this (ADR 0092, 3)', () => {
  it('QA60-H7 Add appends the message, without its files line, to the global preferences', async () => {
    const { fake, view } = await remembered({ default: '', global: 'Use pnpm.' }, 'Never push.\n\nAttached files:\n- attachments/a.txt');
    expect(view.find('[data-test="remember-confirm"]').text()).toContain('Add this to your preferences? Every chat reads them.');
    await view.find('[data-test="remember-add"]').trigger('click');
    await flushPromises();
    expect(settingWrites(fake)).toEqual([{ name: 'kernel.settings.set', input: { key: 'kvcoder.preferences', value: 'Use pnpm.\nNever push.', scope: 'global' } }]);
    expect(view.find('[data-test="remember-confirm"]').exists()).toBe(false);
  });

  it("QA60-E6 into the workspace's own value, Cancel writes nothing, and a refused value changes nothing", async () => {
    const workspace = await remembered({ default: '', global: 'G.', workspace: 'W.' }, 'More.');
    await workspace.view.find('[data-test="remember-add"]').trigger('click');
    await flushPromises();
    expect(settingWrites(workspace.fake)).toEqual([{ name: 'kernel.settings.set', input: { key: 'kvcoder.preferences', value: 'W.\nMore.', scope: 'workspace' } }]);
    const cancel = await remembered({ default: '' }, 'Never push.');
    await cancel.view.find('[data-test="remember-cancel"]').trigger('click');
    expect(settingWrites(cancel.fake)).toEqual([]);
    const refused = await remembered({ default: '' }, 'Too long.', true);
    await refused.view.find('[data-test="remember-add"]').trigger('click');
    await flushPromises();
    expect(refused.fake.toast).toHaveBeenLastCalledWith(expect.any(String), expect.anything(), 'error');
    expect(refused.view.find('[data-test="remember-confirm"]').exists()).toBe(true);
  });

  it("QA60-E7 the agent's replies, notices, and messages from an extension don't offer it", async () => {
    const fake = createFakeKvman();
    for (const shown of [answer('Done.'), message('notice', { code: 'CANCELLED', params: {} }), user('From an extension.', { source: { kind: 'extension', name: '@test/todo' } })]) {
      const view = await mounted(MessageItem, fake, { message: shown, calls: new Map() });
      expect(view.find('[data-test="remember-this"]').exists()).toBe(false);
      view.unmount();
    }
  });
});
