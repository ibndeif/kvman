import { flushPromises } from '@vue/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';
import ArtifactPanel from '../../web/src/ArtifactPanel.vue';
import { createFakeKvman, type FakeKvman } from './support/fake-kvman.ts';
import { artifactContent, artifactSummary, mounted } from './support/fixtures.ts';

const written = vi.fn<(text: string) => Promise<void>>();

function stubClipboard(): void {
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: written } });
}

afterEach(() => {
  written.mockReset();
});

const page = '<!DOCTYPE html>\n<html><body><h1>Todo</h1></body></html>\n';

async function panel(fields: Parameters<typeof artifactContent>[0], fake: FakeKvman = createFakeKvman()) {
  const content = artifactContent(fields);
  return mounted(ArtifactPanel, fake, { list: [artifactSummary({ id: content.id, title: content.title, format: content.format })], shown: content.id, content });
}

describe("the artifact panel's header (08 §8.7, ADR 0017, 4)", () => {
  it('QA24-H7 the header shows the title over its kind and version, the view switch, and labelled icon buttons', async () => {
    const content = artifactContent({ id: 'site', title: 'The running app', format: 'url', version: 2, content: 'http://localhost:8080/' });
    const wrapper = await mounted(ArtifactPanel, createFakeKvman(), { list: [artifactSummary({ id: 'site', title: 'The running app', format: 'url', version: 2 })], shown: 'site', content });
    const head = wrapper.find('.kvc-artifact-head');
    expect(head.find('[data-test="artifact-title"]').text()).toBe('The running app');
    expect(head.find('[data-test="artifact-meta"]').text()).toBe('URL · Version 2');
    expect(head.findAll('.kvc-tab').map((tab) => tab.text())).toEqual(['Preview', 'Source']);
    expect(head.findAll('.kvc-icon-button').map((button) => [button.attributes('data-test'), button.attributes('aria-label'), button.attributes('title'), button.text()])).toEqual([
      ['artifact-open-url', 'Open in a new tab', 'Open in a new tab', ''],
      ['artifact-copy', 'Copy', 'Copy', ''],
      ['artifact-close', 'Close', 'Close', ''],
    ]);
    wrapper.unmount();
  });
});

describe("the artifact panel's views and Copy (08 §8.7, ADR 0009, 214 and 216)", () => {
  it('QA12-H4 Preview comes first, Source shows the text as stored, and showing another artifact returns to Preview', async () => {
    const fake = createFakeKvman();
    const first = artifactContent({ id: 'page', title: 'Page', format: 'html', content: page });
    const second = artifactContent({ id: 'notes', title: 'Notes', format: 'markdown', content: '# Notes\n\n- one' });
    const list = [artifactSummary({ id: 'page', title: 'Page', format: 'html' }), artifactSummary({ id: 'notes', title: 'Notes', format: 'markdown' })];
    const wrapper = await mounted(ArtifactPanel, fake, { list, shown: 'page', content: first });
    expect(wrapper.find('[data-test="artifact-frame"]').exists()).toBe(true);
    expect(wrapper.find('[data-test="artifact-source"]').exists()).toBe(false);
    expect(wrapper.find('[data-test="artifact-view-preview"]').attributes('aria-pressed')).toBe('true');
    await wrapper.find('[data-test="artifact-view-source"]').trigger('click');
    expect(wrapper.find('[data-test="artifact-source"]').text()).toBe(page.trim());
    expect(wrapper.find('[data-test="artifact-source"]').element.textContent).toBe(page);
    expect(wrapper.find('[data-test="artifact-frame"]').exists()).toBe(false);
    expect(wrapper.find('[data-test="artifact-view-source"]').attributes('aria-pressed')).toBe('true');
    await wrapper.find('[data-test="artifact-view-preview"]').trigger('click');
    expect(wrapper.find('[data-test="artifact-frame"]').exists()).toBe(true);
    await wrapper.find('[data-test="artifact-view-source"]').trigger('click');
    await wrapper.setProps({ shown: 'notes', content: second });
    expect(wrapper.find('[data-test="artifact-source"]').exists()).toBe(false);
    expect(wrapper.find('[data-test="markdown"]').text()).toContain('# Notes');
    await wrapper.find('[data-test="artifact-view-source"]').trigger('click');
    expect(wrapper.find('[data-test="artifact-source"]').element.textContent).toBe('# Notes\n\n- one');
    wrapper.unmount();
  });

  it('QA12-H5 Copy puts the stored text on the clipboard and says it was copied', async () => {
    stubClipboard();
    written.mockResolvedValue(undefined);
    const fake = createFakeKvman();
    const wrapper = await panel({ id: 'page', title: 'Page', format: 'html', content: page }, fake);
    await wrapper.find('[data-test="artifact-copy"]').trigger('click');
    await flushPromises();
    expect(written).toHaveBeenCalledExactlyOnceWith(page);
    expect(fake.toast).toHaveBeenCalledWith('kvcoder.ui.copied', {}, 'success');
    wrapper.unmount();
  });

  it('QA12-E4 a refused copy toasts an error and never says copied', async () => {
    stubClipboard();
    written.mockRejectedValue(new Error('Denied.'));
    const fake = createFakeKvman();
    const wrapper = await panel({ content: '# Plan' }, fake);
    await wrapper.find('[data-test="artifact-copy"]').trigger('click');
    await flushPromises();
    expect(fake.toast).toHaveBeenCalledWith('kvcoder.ui.failed', {}, 'error');
    expect(fake.toast).not.toHaveBeenCalledWith('kvcoder.ui.copied', {}, 'success');
    wrapper.unmount();
  });

  it('QA12-E5 before the content arrives Copy is off and Source shows nothing', async () => {
    const wrapper = await mounted(ArtifactPanel, createFakeKvman(), { list: [artifactSummary({})], shown: 'plan', content: undefined });
    expect(wrapper.find('[data-test="artifact-copy"]').attributes('disabled')).toBeDefined();
    await wrapper.find('[data-test="artifact-view-source"]').trigger('click');
    expect(wrapper.find('[data-test="artifact-source"]').exists()).toBe(false);
    wrapper.unmount();
  });

  it('QA12-H6 a url artifact previews in a frame that lets the page work as in a tab, without top navigation, Source shows the address, and a link opens it in a new tab', async () => {
    const wrapper = await panel({ id: 'app', title: 'App', format: 'url', content: 'http://localhost:8080/' });
    const frame = wrapper.find('[data-test="artifact-url-frame"]');
    const rights = (frame.attributes('sandbox') ?? '').split(' ');
    expect(rights).toEqual(['allow-scripts', 'allow-same-origin', 'allow-forms', 'allow-popups', 'allow-modals', 'allow-downloads']);
    expect(rights).not.toContain('allow-top-navigation');
    expect(frame.attributes('referrerpolicy')).toBe('no-referrer');
    expect(frame.attributes('src')).toBe('http://localhost:8080/');
    const link = wrapper.find('[data-test="artifact-open-url"]');
    expect(link.attributes()).toMatchObject({ href: 'http://localhost:8080/', target: '_blank', rel: 'noopener noreferrer' });
    await wrapper.find('[data-test="artifact-view-source"]').trigger('click');
    expect(wrapper.find('[data-test="artifact-source"]').text()).toBe('http://localhost:8080/');
    expect(wrapper.find('[data-test="artifact-url-frame"]').exists()).toBe(false);
    wrapper.unmount();
  });

  it("QA12-E3 the panel doesn't frame kvman's own address, a remote one, or a script, and says so", async () => {
    const own = new URL(window.location.href);
    const ownPort = own.port === '' ? '' : `:${own.port}`;
    for (const address of [`http://localhost${ownPort}/`, `http://127.0.0.1${ownPort}/`, 'https://example.com', 'javascript:alert(1)', 'http://user:pw@localhost:8081/']) {
      const wrapper = await panel({ id: 'app', title: 'App', format: 'url', content: address });
      expect(wrapper.find('iframe').exists(), address).toBe(false);
      expect(wrapper.find('[data-test="artifact-open-url"]').exists(), address).toBe(false);
      expect(wrapper.find('[data-test="artifact-url-refused"]').text(), address).toContain("can't be shown here");
      wrapper.unmount();
    }
  });
});
