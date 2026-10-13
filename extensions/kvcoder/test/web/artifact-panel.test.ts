import { flushPromises } from '@vue/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';
import ConversationView from '../../web/src/ConversationView.vue';
import ArtifactPanel from '../../web/src/ArtifactPanel.vue';
import { artifactPolicy } from '../../web/src/artifact-document.ts';
import { createFakeKvman } from './support/fake-kvman.ts';
import { artifactContent, artifactResult, artifactSummary, choose, mounted, serve, session, turn, user, type World } from './support/fixtures.ts';

afterEach(() => {
  vi.useRealTimers();
});

function chatWorld(): World {
  const found = session({ updatedAt: '2026-10-01T09:00:00.000Z' });
  return { found, messages: [user('Plan it'), artifactResult({})], omitted: 0, turns: [turn()] };
}

const report = artifactSummary({ id: 'report', title: 'The report', updatedAt: '2026-10-01T09:01:30.000Z' });
const reportContent = artifactContent({ id: 'report', title: 'The report', content: '# Report', updatedAt: '2026-10-01T09:01:30.000Z' });

// The plan as its `version` written at `updatedAt`, beside the report.
function planVersion(version: number, updatedAt: string): Partial<World> {
  return { artifacts: [artifactSummary({ version, updatedAt }), report], artifactContents: { plan: artifactContent({ version, content: `# Plan v${version}`, updatedAt }), report: reportContent } };
}

// The chat as its next read finds it.
async function later(world: World, change: Partial<World>, stamp = change.artifacts?.[0]?.updatedAt ?? world.found.updatedAt): Promise<void> {
  Object.assign(world, change, { found: session({ ...world.found, updatedAt: stamp }) });
  await vi.advanceTimersByTimeAsync(5_000);
  await flushPromises();
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
    expect(wrapper.find('[data-test="artifacts-toggle"]').text()).toBe('1');
    expect(wrapper.find('[data-test="artifacts-toggle"]').attributes()).toMatchObject({ 'aria-label': 'Artifacts (1)', title: 'Artifacts (1)' });
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

  it('QA6-H16 clicking a card opens the panel on that artifact, QA6-H17 its title in the list switches it, and QA6-H18 it follows updates', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'Date'] });
    const fake = createFakeKvman();
    const world = chatWorld();
    world.artifacts = [artifactSummary({}), report];
    world.artifactContents = { plan: artifactContent({}), report: reportContent };
    serve(fake, world);
    const wrapper = await mounted(ConversationView, fake, { sessionId: 's1' });
    await wrapper.find('[data-test="artifact-open"]').trigger('click');
    await flushPromises();
    expect(wrapper.find('[data-test="artifact-picker"]').text()).toBe('The plan');
    await choose(wrapper, 'artifact-picker', 'artifact:report');
    expect(wrapper.find('[data-test="artifact-body"]').text()).toContain('# Report');
    await choose(wrapper, 'artifact-picker', 'artifact:plan');
    await later(world, planVersion(2, '2026-10-01T09:03:00.000Z'));
    expect(wrapper.find('[data-test="artifact-version"]').text()).toBe('Version 2');
    expect(wrapper.find('[data-test="artifact-body"]').text()).toContain('# Plan v2');
    wrapper.unmount();
  });

  it('QA50-H3 an updated artifact opens a closed panel on itself, and takes the panel from another artifact', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'Date'] });
    const fake = createFakeKvman();
    const world = chatWorld();
    world.artifacts = [artifactSummary({}), report];
    world.artifactContents = { plan: artifactContent({}), report: reportContent };
    serve(fake, world);
    const wrapper = await mounted(ConversationView, fake, { sessionId: 's1' });
    await wrapper.find('[data-test="artifact-open"]').trigger('click');
    await flushPromises();
    await wrapper.find('[data-test="artifact-close"]').trigger('click');
    expect(wrapper.find('[data-test="artifact-panel"]').exists()).toBe(false);
    await later(world, planVersion(2, '2026-10-01T09:03:00.000Z'));
    expect(wrapper.find('[data-test="artifact-picker"]').text()).toBe('The plan');
    expect(wrapper.find('[data-test="artifact-body"]').text()).toContain('# Plan v2');
    await choose(wrapper, 'artifact-picker', 'artifact:report');
    expect(wrapper.find('[data-test="artifact-body"]').text()).toContain('# Report');
    await later(world, planVersion(3, '2026-10-01T09:04:00.000Z'));
    expect(wrapper.find('[data-test="artifact-picker"]').text()).toBe('The plan');
    expect(wrapper.find('[data-test="artifact-body"]').text()).toContain('# Plan v3');
    wrapper.unmount();
  });

  it('QA50-E3 a later read with nothing changed keeps the panel closed', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'Date'] });
    const fake = createFakeKvman();
    const world = chatWorld();
    world.artifacts = [artifactSummary({}), report];
    world.artifactContents = { plan: artifactContent({}), report: reportContent };
    serve(fake, world);
    const wrapper = await mounted(ConversationView, fake, { sessionId: 's1' });
    expect(wrapper.find('[data-test="artifact-panel"]').exists()).toBe(false);
    await later(world, {}, '2026-10-01T09:05:00.000Z');
    expect(fake.calls.filter((call) => call.name === 'kvcoder.artifact.list').length).toBeGreaterThan(1);
    expect(wrapper.find('[data-test="artifact-panel"]').exists()).toBe(false);
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
