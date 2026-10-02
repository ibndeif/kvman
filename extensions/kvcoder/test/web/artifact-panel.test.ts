import { flushPromises } from '@vue/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';
import ConversationView from '../../web/src/ConversationView.vue';
import ArtifactPanel from '../../web/src/ArtifactPanel.vue';
import { artifactPolicy } from '../../web/src/artifact-document.ts';
import { createFakeKvman } from './support/fake-kvman.ts';
import { artifactContent, artifactResult, artifactSummary, mounted, serve, session, turn, user, type World } from './support/fixtures.ts';

afterEach(() => {
  vi.useRealTimers();
});

function chatWorld(): World {
  const found = session({ updatedAt: '2026-10-01T09:00:00.000Z' });
  return { found, messages: [user('Plan it'), artifactResult({})], omitted: 0, turns: [turn()] };
}

describe('the artifact panel beside the conversation (08 §8.7, ADR 0009, 177 and 182)', () => {
  it('QA6-E14 a chat with no artifact has no panel and QA6-H25 with no artifact there is no button', async () => {
    const fake = createFakeKvman();
    const world = chatWorld();
    world.messages = [user('Hello')];
    serve(fake, world);
    const wrapper = await mounted(ConversationView, fake, { sessionId: 's1' });
    expect(wrapper.find('[data-test="artifact-panel"]').exists()).toBe(false);
    expect(wrapper.find('[data-test="artifacts-toggle"]').exists()).toBe(false);
    wrapper.unmount();
  });

  it('QA6-E24 an artifact already there when the chat is opened does not open the panel, QA6-H25 the header button opens and closes it, and QA6-H15 a new id opens it by itself', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'Date'] });
    const fake = createFakeKvman();
    const world = chatWorld();
    world.artifacts = [artifactSummary({})];
    world.artifactContents = { plan: artifactContent({}) };
    serve(fake, world);
    const wrapper = await mounted(ConversationView, fake, { sessionId: 's1' });
    expect(wrapper.find('[data-test="artifact-panel"]').exists()).toBe(false);
    expect(wrapper.find('[data-test="artifacts-toggle"]').text()).toBe('Artifacts (1)');
    await wrapper.find('[data-test="artifacts-toggle"]').trigger('click');
    await flushPromises();
    expect(wrapper.find('[data-test="artifact-panel"]').exists()).toBe(true);
    expect(wrapper.find('[data-test="artifact-title"]').text()).toBe('The plan');
    await wrapper.find('[data-test="artifact-close"]').trigger('click');
    await flushPromises();
    expect(wrapper.find('[data-test="artifact-panel"]').exists()).toBe(false);
    world.artifacts = [artifactSummary({}), artifactSummary({ id: 'report', title: 'The report', updatedAt: '2026-10-01T09:02:00.000Z' })];
    world.artifactContents = { plan: artifactContent({}), report: artifactContent({ id: 'report', title: 'The report', content: '# Report', updatedAt: '2026-10-01T09:02:00.000Z' }) };
    world.found = session({ updatedAt: '2026-10-01T09:02:00.000Z' });
    await vi.advanceTimersByTimeAsync(5_000);
    await flushPromises();
    expect(wrapper.find('[data-test="artifact-panel"]').exists()).toBe(true);
    expect(wrapper.find('[data-test="artifact-version"]').text()).toBe('Version 1');
    wrapper.unmount();
  });

  it('QA6-H16 clicking a card opens the panel on that artifact, QA6-H17 titles switch it, QA6-H18 it follows updates, and QA6-E13 a closed panel stays closed on an update', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'Date'] });
    const fake = createFakeKvman();
    const world = chatWorld();
    world.artifacts = [artifactSummary({}), artifactSummary({ id: 'report', title: 'The report', updatedAt: '2026-10-01T09:01:30.000Z' })];
    world.artifactContents = { plan: artifactContent({}), report: artifactContent({ id: 'report', title: 'The report', content: '# Report', updatedAt: '2026-10-01T09:01:30.000Z' }) };
    serve(fake, world);
    const wrapper = await mounted(ConversationView, fake, { sessionId: 's1' });
    await wrapper.find('[data-test="artifact-open"]').trigger('click');
    await flushPromises();
    expect(wrapper.find('[data-test="artifact-panel"]').exists()).toBe(true);
    expect(wrapper.find('[data-test="artifact-tab-report"]').exists()).toBe(true);
    await wrapper.find('[data-test="artifact-tab-report"]').trigger('click');
    await flushPromises();
    expect(wrapper.find('[data-test="artifact-body"]').text()).toContain('# Report');
    await wrapper.find('[data-test="artifact-tab-plan"]').trigger('click');
    await flushPromises();
    const report = artifactContent({ id: 'report', title: 'The report', content: '# Report', updatedAt: '2026-10-01T09:01:30.000Z' });
    world.artifacts = [artifactSummary({ version: 2, updatedAt: '2026-10-01T09:03:00.000Z' }), artifactSummary({ id: 'report', title: 'The report', updatedAt: '2026-10-01T09:01:30.000Z' })];
    world.artifactContents = { plan: artifactContent({ version: 2, content: '# Plan v2', updatedAt: '2026-10-01T09:03:00.000Z' }), report };
    world.found = session({ updatedAt: '2026-10-01T09:03:00.000Z' });
    await vi.advanceTimersByTimeAsync(5_000);
    await flushPromises();
    expect(wrapper.find('[data-test="artifact-version"]').text()).toBe('Version 2');
    expect(wrapper.find('[data-test="artifact-body"]').text()).toContain('# Plan v2');
    await wrapper.find('[data-test="artifact-close"]').trigger('click');
    await flushPromises();
    world.artifacts = [artifactSummary({ version: 3, updatedAt: '2026-10-01T09:04:00.000Z' }), artifactSummary({ id: 'report', title: 'The report', updatedAt: '2026-10-01T09:01:30.000Z' })];
    world.artifactContents = { plan: artifactContent({ version: 3, content: '# Plan v3', updatedAt: '2026-10-01T09:04:00.000Z' }), report };
    world.found = session({ updatedAt: '2026-10-01T09:04:00.000Z' });
    await vi.advanceTimersByTimeAsync(5_000);
    await flushPromises();
    expect(wrapper.find('[data-test="artifact-panel"]').exists()).toBe(false);
    await wrapper.find('[data-test="artifact-open"]').trigger('click');
    await flushPromises();
    expect(wrapper.find('[data-test="artifact-panel"]').exists()).toBe(true);
    wrapper.unmount();
  });

  it('QA6-E19 a Markdown artifact with script, onerror, and javascript: links passes its text to the markdown view and renders it nowhere else', async () => {
    const fake = createFakeKvman();
    const evil = '<script>alert(1)</script>\n<img src="x" onerror="alert(1)">\n[j](javascript:alert(1))';
    const wrapper = await mounted(ArtifactPanel, fake, { list: [artifactSummary({})], shown: 'plan', content: artifactContent({ content: evil }) });
    expect(wrapper.find('[data-test="markdown"]').text()).toContain(evil);
    expect(wrapper.find('script').exists()).toBe(false);
    expect(wrapper.find('img').exists()).toBe(false);
  });

  it('QA6-H19 an HTML artifact is a sandboxed frame with the policy first', async () => {
    const fake = createFakeKvman();
    const wrapper = await mounted(ArtifactPanel, fake, { list: [artifactSummary({ format: 'html', title: 'Page' })], shown: 'plan', content: artifactContent({ format: 'html', title: 'Page', content: '<p>Hi</p>' }) });
    const frame = wrapper.find('[data-test="artifact-frame"]');
    expect(frame.attributes('sandbox')).toBe('allow-scripts');
    expect(frame.attributes('referrerpolicy')).toBe('no-referrer');
    const srcdoc = String(frame.attributes('srcdoc') ?? '');
    expect(srcdoc.startsWith(`<!doctype html><meta http-equiv="Content-Security-Policy" content="${artifactPolicy}">`)).toBe(true);
  });
});
