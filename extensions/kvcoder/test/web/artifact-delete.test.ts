import { flushPromises } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import ArtifactPanel from '../../web/src/ArtifactPanel.vue';
import { createFakeKvman } from './support/fake-kvman.ts';
import { artifactContent, artifactSummary, mounted } from './support/fixtures.ts';

// The panel's Delete (plan 08 §8.7, ADR 0105, 3): a trash icon that asks first, in the panel, then runs the command.

const props = { list: [artifactSummary({ id: 'report', title: 'Report' })], shown: 'report', content: artifactContent({ id: 'report', title: 'Report' }), sessionId: 's1' };

describe("the artifact panel's Delete (08 §8.7, ADR 0105, 3)", () => {
  it('QA70-H4 Delete asks, then runs kvcoder.artifact.delete', async () => {
    const fake = createFakeKvman();
    fake.handle('kvcoder.artifact.delete', () => ({ id: 'report', deleted: true }));
    const wrapper = await mounted(ArtifactPanel, fake, props);
    const trash = wrapper.find('[data-test="artifact-delete"]');
    expect(trash.attributes('aria-label')).toBe('Delete');
    await trash.trigger('click');
    const question = wrapper.find('[data-test="artifact-delete-confirm"]');
    expect(question.attributes('role')).toBe('alertdialog');
    expect(question.text()).toContain('Delete this artifact?');
    expect(fake.calls.filter((call) => call.name === 'kvcoder.artifact.delete')).toEqual([]);
    await wrapper.find('[data-test="artifact-confirm-delete"]').trigger('click');
    await flushPromises();
    expect(fake.calls.filter((call) => call.name === 'kvcoder.artifact.delete').map((call) => call.input)).toEqual([{ sessionId: 's1', payload: { id: 'report' } }]);
    expect(wrapper.emitted('deleted')).toHaveLength(1);
    expect(wrapper.find('[data-test="artifact-delete-confirm"]').exists()).toBe(false);
    wrapper.unmount();
  });

  it('QA70-E5 Cancel deletes nothing, and the map has no Delete', async () => {
    const fake = createFakeKvman();
    const wrapper = await mounted(ArtifactPanel, fake, props);
    await wrapper.find('[data-test="artifact-delete"]').trigger('click');
    await wrapper.find('[data-test="artifact-delete-cancel"]').trigger('click');
    expect(wrapper.find('[data-test="artifact-delete-confirm"]').exists()).toBe(false);
    expect(fake.calls.filter((call) => call.name === 'kvcoder.artifact.delete')).toEqual([]);
    await wrapper.setProps({ map: { goal: 'Goal', version: 1, steps: [], notes: [] }, mapShown: true });
    expect(wrapper.find('[data-test="artifact-delete"]').exists()).toBe(false);
    wrapper.unmount();
  });
});
