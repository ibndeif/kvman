import { flushPromises } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import ApprovalNote from '../../web/src/ApprovalNote.vue';
import ShellSettings from '../../web/src/ShellSettings.vue';
import { createFakeKvman } from './support/fake-kvman.ts';
import { mounted } from './support/fixtures.ts';
import { serveSettings } from './support/settings-world.ts';

const key = 'kvcoder.shell.approval';
const rows = (value: 'ask' | 'auto') => [{ key, value, source: 'global' }];
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((done, fail) => { resolve = done; reject = fail; });
  return { promise, resolve, reject };
}

describe('approval note current effective-setting boundaries', () => {
  for (const late of ['success', 'failure'] as const) {
    it(`ignores old workspace ${late} after a newer effective mode loaded`, async () => {
      const first = deferred<ReturnType<typeof rows>>();
      const fake = createFakeKvman();
      let calls = 0;
      fake.handle('kernel.settings.list', () => ++calls === 1 ? first.promise : rows('ask'));
      const view = await mounted(ApprovalNote, fake);
      fake.workspace.value = { id: 'new', name: 'New workspace', path: '/work/new' };
      await flushPromises();
      expect(view.find('[data-test="approval-mode"]').text()).toBe(fake.kvman.t('kvcoder.ui.approvalNote.ask'));
      if (late === 'success') first.resolve(rows('auto')); else first.reject(new Error('Old workspace unavailable'));
      await flushPromises();
      expect(view.find('[data-test="approval-failed"]').exists()).toBe(false);
      expect(view.find('[data-test="approval-mode"]').text()).toBe(fake.kvman.t('kvcoder.ui.approvalNote.ask'));
      view.unmount();
    });
  }

  it('refreshes the shared note after changing the saved approval mode', async () => {
    const fake = createFakeKvman();
    serveSettings(fake, { [key]: { default: 'auto', global: 'ask' }, 'kvcoder.shell.path': { default: null } });
    const view = await mounted(ShellSettings, fake);
    expect(view.find('[data-test="approval-mode"]').text()).toBe(fake.kvman.t('kvcoder.ui.approvalNote.ask'));
    await view.find('[data-test="shell-approval-control"]').setValue('auto');
    await flushPromises();
    expect(view.find('[data-test="approval-mode"]').text()).toBe(fake.kvman.t('kvcoder.ui.approvalNote.auto'));
    view.unmount();
  });

  it('refreshes the shared note when resetting an override to the effective default', async () => {
    const fake = createFakeKvman();
    serveSettings(fake, { [key]: { default: 'auto', global: 'ask' }, 'kvcoder.shell.path': { default: null } });
    const view = await mounted(ShellSettings, fake);
    const reset = view.find('[data-test="shell-approval-reset"]');
    expect(reset.exists()).toBe(true);
    await reset.trigger('click');
    await flushPromises();
    expect(view.find('[data-test="approval-mode"]').text()).toBe(fake.kvman.t('kvcoder.ui.approvalNote.auto'));
    view.unmount();
  });
});
