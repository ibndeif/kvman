import { describe, expect, it } from 'vitest';
import MessageItem from '../../web/src/MessageItem.vue';
import { createFakeKvman } from './support/fake-kvman.ts';
import { artifactResult, mounted } from './support/fixtures.ts';

describe('an artifact write or edit as a card (08 §8.7, ADR 0009, 177)', () => {
  it('QA6-H14 the conversation shows the title, Version N, and Open, not the shell card and not the content', async () => {
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
