import { flushPromises, mount } from '@vue/test-utils';
import { afterEach, describe, expect, it } from 'vitest';
import ConnectorsList from '../../web/src/ConnectorsList.vue';
import { createFakeKvman, type FakeKvman } from './support/fake-kvman.ts';
import { serveSettings } from './support/settings-world.ts';

let attached: ReturnType<typeof mount> | undefined;

afterEach(() => {
  attached?.unmount();
  attached = undefined;
});

function world(): FakeKvman {
  const fake = createFakeKvman();
  fake.handle('kvcoder.connector.list', () => []);
  serveSettings(fake, { 'kvcoder.connectors.disabled': { default: [] }, 'kvcoder.shell.approval': { default: 'auto' }, 'kvcoder.shell.path': { default: null } });
  return fake;
}

// Mounted in the document, so focus is real.
async function opened(fake: FakeKvman) {
  const list = mount(ConnectorsList, { attachTo: document.body, global: { provide: { kvman: fake.kvman } } });
  attached = list;
  await flushPromises();
  await list.find('[data-test="connector-shell"] [data-test="connector-configure"]').trigger('click');
  await flushPromises();
  return list;
}

const dialog = (list: ReturnType<typeof mount>) => list.find('[data-test="connector-dialog"]');
const cog = (list: ReturnType<typeof mount>) => list.find('[data-test="connector-shell"] [data-test="connector-configure"]').element;

describe("a connector's dialog (08 §8.7, ADR 0020, 2)", () => {
  it("QA28-H2 the cog opens the connector's dialog, which names the connector and where a change applies", async () => {
    const fake = world();
    const list = await opened(fake);
    expect([dialog(list).attributes('role'), dialog(list).attributes('aria-modal'), dialog(list).attributes('aria-label')]).toEqual(['dialog', 'true', 'Configure shell']);
    expect(list.find('[data-test="connector-dialog-title"]').text()).toBe('shell');
    expect(list.find('[data-test="connector-dialog-scope"]').text()).toBe('Changes apply to all workspaces');
    expect(['shell-approval', 'shell-path'].map((row) => list.find(`[data-test="${row}-title"]`).text())).toEqual(['Shell approval', 'Shell program']);
    fake.scope.value = 'workspace';
    await flushPromises();
    expect(list.find('[data-test="connector-dialog-scope"]').text()).toBe('Changes apply to notes-app only');
  });

  it('QA28-H6 Escape, the backdrop, and Close each close it, a press inside does not, and focus returns to the cog', async () => {
    const list = await opened(world());
    expect(dialog(list).element.contains(document.activeElement)).toBe(true);
    await dialog(list).trigger('click');
    expect(dialog(list).exists()).toBe(true);
    const closers = [() => dialog(list).trigger('keydown', { key: 'Escape' }), () => list.find('[data-test="connector-dialog-backdrop"]').trigger('click'), () => list.find('[data-test="connector-dialog-close"]').trigger('click')];
    for (const close of closers) {
      await close();
      await flushPromises();
      expect(dialog(list).exists()).toBe(false);
      expect(document.activeElement).toBe(cog(list));
      await list.find('[data-test="connector-shell"] [data-test="connector-configure"]').trigger('click');
      await flushPromises();
    }
  });

  it('QA28-E4 Tab stays in the dialog: it wraps from the last control to the first, and back with Shift', async () => {
    const list = await opened(world());
    const close = list.find('[data-test="connector-dialog-close"]').element as HTMLElement;
    const last = list.find('[data-test="shell-path-control"]').element as HTMLElement;
    last.focus();
    await dialog(list).trigger('keydown', { key: 'Tab' });
    expect(document.activeElement).toBe(close);
    await dialog(list).trigger('keydown', { key: 'Tab', shiftKey: true });
    expect(document.activeElement).toBe(last);
    (list.find('[data-test="shell-approval-control"]').element as HTMLElement).focus();
    await dialog(list).trigger('keydown', { key: 'Tab' });
    expect(document.activeElement).toBe(list.find('[data-test="shell-approval-control"]').element);
  });
});
