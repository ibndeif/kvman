import type { Json } from '@kvman/sdk';
import { describe, expect, it } from 'vitest';
import ChatStart from '../../web/src/ChatStart.vue';
import { createFakeKvman, type FakeKvman } from './support/fake-kvman.ts';
import { mounted } from './support/fixtures.ts';

// The new chat's words (08 §8.7): one approval line (ADR 0082, 6), Home's name (7), and a profile's heading and
// placeholder (11), all from `kernel.settings.list`.
function wordsFake(settings: Record<string, Json>, pending = false): FakeKvman {
  const fake = createFakeKvman();
  const rows = Object.entries({ 'kvcoder.model': null, 'kvai.defaultModel': 'fake/m1', 'kvcoder.thinking': 'medium', ...settings }).map(([key, value]) => ({ key, value }));
  fake.handle('kernel.settings.list', () => (pending ? new Promise<never>(() => {}) : rows));
  fake.handle('kvai.provider.list', () => [{ id: 'fake', title: 'Fake', status: 'ready' }]);
  fake.handle('kvai.model.list', () => [{ id: 'fake/m1', name: 'M1', provider: 'fake' }]);
  return fake;
}

describe("the new chat's words (08 §8.7, ADR 0082)", () => {
  it('QA52-H6 the approval line is one plain sentence per mode, with Change opening kvcoder\'s configuration', async () => {
    const lines = { auto: 'The agent asks you before risky actions.', ask: 'The agent asks you before every action that changes something.', never: 'The agent acts without asking you.' };
    for (const [mode, line] of Object.entries(lines)) {
      const fake = wordsFake({ 'kvcoder.approval': mode });
      const view = await mounted(ChatStart, fake);
      const shown = view.find('[data-test="approval-line"]');
      expect(shown.attributes('data-mode')).toBe(mode);
      expect(shown.text()).toBe(`${line} Change`);
      expect(view.find('[data-test="approval-note"]').exists()).toBe(false);
      expect(view.text()).not.toContain('risky:false');
      await view.find('[data-test="approval-config"]').trigger('click');
      expect(fake.navigate).toHaveBeenCalledWith('kvwebui.extension', { namespace: 'kvcoder' });
      view.unmount();
    }
  });

  it('QA52-H7 Home is called Home, and another workspace by its name', async () => {
    const home = wordsFake({ 'kvcoder.approval': 'auto' });
    home.workspace.value = { id: 'home', name: 'ahmed', path: '/home/ahmed' };
    const homeView = await mounted(ChatStart, home);
    expect(homeView.find('[data-test="start-heading"]').text()).toBe('What should we build in Home?');
    homeView.unmount();
    const other = wordsFake({ 'kvcoder.approval': 'auto' });
    other.workspace.value = { id: 'w1', name: 'notes', path: '/work/notes' };
    const otherView = await mounted(ChatStart, other);
    expect(otherView.find('[data-test="start-heading"]').text()).toBe('What should we build in notes?');
    otherView.unmount();
  });

  it("QA52-H12 a profile's heading and placeholder replace kvcoder's", async () => {
    const fake = wordsFake({ 'kvcoder.approval': 'auto', 'kvcoder.profile': { startHeading: 'notes.start', placeholder: 'notes.ask' } });
    const view = await mounted(ChatStart, fake);
    expect(view.find('[data-test="start-heading"]').text()).toBe(fake.kvman.t('notes.start', { workspace: 'Home' }));
    expect(view.find('[data-test="composer-text"]').attributes('placeholder')).toBe(fake.kvman.t('notes.ask'));
    view.unmount();
  });

  it('QA52-E7 the line hides with the Extensions page, and is empty while the mode loads or when it is not loaded', async () => {
    const hidden = await mounted(ChatStart, wordsFake({ 'kvcoder.approval': 'auto', 'kvwebui.nav.hidden': ['kvwebui.extensions'] }));
    expect(hidden.find('[data-test="approval-line"]').exists()).toBe(false);
    hidden.unmount();
    const loading = await mounted(ChatStart, wordsFake({}, true));
    expect(loading.find('[data-test="approval-line"]').exists()).toBe(false);
    expect(loading.find('[data-test="start-heading"]').exists()).toBe(false);
    loading.unmount();
    const unset = await mounted(ChatStart, wordsFake({}));
    expect(unset.find('[data-test="approval-line"]').exists()).toBe(false);
    expect(unset.find('[data-test="start-heading"]').exists()).toBe(true);
    unset.unmount();
  });
});
