import { describe, expect, it } from 'vitest';
import MessageItem from '../../web/src/MessageItem.vue';
import { callView, type CallView } from '../../web/src/call-view.ts';
import { createFakeKvman } from './support/fake-kvman.ts';
import { artifactResult, mounted } from './support/fixtures.ts';

// The call `c1` that the card's result answers, as the conversation keeps it.
const writeCall = (content: string): Map<string, CallView> => new Map([['c1', callView({ connector: 'artifact', command: 'write', payload: { id: 'video', title: 'Watch it', format: 'url', content } })]]);

describe('an artifact write or edit as a card (08 §8.7, ADR 0009, 177)', () => {
  it('QA6-H14 QA78-E6 the conversation shows the title, Version N, and Open, not the shell card and not the content', async () => {
    const fake = createFakeKvman();
    const wrapper = await mounted(MessageItem, fake, { message: artifactResult({ title: 'The plan', version: 2 }), calls: new Map() });
    expect(wrapper.find('[data-test="artifact-card"]').exists()).toBe(true);
    expect(wrapper.find('[data-test="artifact-card-title"]').text()).toBe('The plan');
    expect(wrapper.find('[data-test="artifact-card-version"]').text()).toBe('Version 2');
    expect(wrapper.find('[data-test="artifact-open"]').exists()).toBe(true);
    expect(wrapper.find('[data-test="call-card"]').exists()).toBe(false);
    expect(wrapper.text()).not.toContain('# The plan');
    await wrapper.find('[data-test="artifact-open"]').trigger('click');
    expect(wrapper.emitted('openArtifact')).toEqual([['plan']]);
  });
});

describe('a url artifact card opens a tab (ADR 0119, 5)', () => {
  it('QA78-H6 Open is a new-tab link to the address its call wrote', async () => {
    const fake = createFakeKvman();
    const wrapper = await mounted(MessageItem, fake, { message: artifactResult({ id: 'video', format: 'url' }), calls: writeCall('http://127.0.0.1:8765/v.mp4') });
    const open = wrapper.find('[data-test="artifact-open"]');
    expect(open.element.tagName).toBe('A');
    expect(open.attributes()).toMatchObject({ href: 'http://127.0.0.1:8765/v.mp4', target: '_blank', rel: 'noopener noreferrer' });
    // The test page doesn't follow the link, so nothing reaches the network.
    open.element.addEventListener('click', (event) => event.preventDefault());
    await open.trigger('click');
    expect(wrapper.emitted('openArtifact')).toBeUndefined();
  });

  it("QA78-E4 an address on kvman's own port, or not local, opens the panel", async () => {
    for (const content of [`http://127.0.0.1:${window.location.port === '' ? '80' : window.location.port}/`, 'https://example.com/']) {
      const fake = createFakeKvman();
      const wrapper = await mounted(MessageItem, fake, { message: artifactResult({ id: 'video', format: 'url' }), calls: writeCall(content) });
      const open = wrapper.find('[data-test="artifact-open"]');
      expect(open.element.tagName, content).toBe('BUTTON');
      await open.trigger('click');
      expect(wrapper.emitted('openArtifact'), content).toEqual([['video']]);
    }
  });

  it('QA78-E5 a card whose call is unknown, or an edit, opens the panel', async () => {
    const edit = new Map([['c1', callView({ connector: 'artifact', command: 'edit', payload: { id: 'video', edits: [] } })]]);
    for (const calls of [new Map<string, CallView>(), edit]) {
      const fake = createFakeKvman();
      const wrapper = await mounted(MessageItem, fake, { message: artifactResult({ id: 'video', format: 'url' }), calls });
      await wrapper.find('[data-test="artifact-open"]').trigger('click');
      expect(wrapper.emitted('openArtifact')).toEqual([['video']]);
    }
  });
});
