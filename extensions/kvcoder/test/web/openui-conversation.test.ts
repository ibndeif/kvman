import { flushPromises, type VueWrapper } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import ConversationView from '../../web/src/ConversationView.vue';
import { createFakeKvman, MarkdownStub, progress, type FakeKvman } from './support/fake-kvman.ts';
import { answer, artifactContent, artifactResult, artifactSummary, mounted, serve, session, turn, user, type World } from './support/fixtures.ts';

// kvwebui draws OpenUI and turns a press into `onMessage(text)` (its own tests); here, which views kvcoder gives an
// `onMessage`, and what a press does (08 §8.7, ADR 0124, 6 and 18).

const block = (label: string): string => `Pick one:\n\n\`\`\`openui\nroot = Card([go])\ngo = Button("${label}")\n\`\`\``;
const dashboard = 'root = Stack([title])\ntitle = CardHeader("Release")';

function chat(fields: Partial<World> = {}): World {
  return { found: session(), messages: [user('go'), answer(block('Older')), user('more'), answer(block('Newer'))], omitted: 0, turns: [turn({ outcome: 'done' })], ...fields };
}

// The views that were given an `onMessage`, and what each shows.
function pressable(wrapper: VueWrapper): { text: string; press: (text: string) => void }[] {
  return wrapper.findAllComponents(MarkdownStub).flatMap((view) => {
    const onMessage: unknown = view.props('onMessage');
    return typeof onMessage === 'function' ? [{ text: view.text(), press: (text: string) => void Reflect.apply(onMessage, undefined, [text]) }] : [];
  });
}

async function started(world: World, fake: FakeKvman = createFakeKvman()): Promise<{ fake: FakeKvman; wrapper: VueWrapper }> {
  serve(fake, world);
  fake.handle('kvcoder.message.send', () => ({}));
  return { fake, wrapper: await mounted(ConversationView, fake, { sessionId: 's1' }) };
}

const sends = (fake: FakeKvman) => fake.calls.filter((call) => call.name === 'kvcoder.message.send').map((call) => call.input);

describe('presses in the conversation (08 §8.7, ADR 0124, 6)', () => {
  it("M5.18-H18 a press in the newest reply sends the person's message with a sendId, as a typed one does", async () => {
    const { fake, wrapper } = await started(chat());
    const [newest] = pressable(wrapper);
    expect(newest?.text).toContain('Newer');
    newest?.press('Start the build');
    await flushPromises();
    expect(sends(fake)).toEqual([{ sessionId: 's1', text: 'Start the build', sendId: expect.any(String) }]);
    wrapper.unmount();
  });

  it('M5.18-E23 an older reply is given no onMessage, so its UI is drawn disabled', async () => {
    const { wrapper } = await started(chat());
    expect(pressable(wrapper).map((view) => view.text)).toEqual([expect.stringContaining('Newer')]);
    expect(wrapper.findAllComponents(MarkdownStub).some((view) => view.text().includes('Older'))).toBe(true);
    wrapper.unmount();
  });

  it('M5.18-H19 while the agent works, a press in the newest stored reply sends, steering the turn', async () => {
    const { fake, wrapper } = await started(chat({ found: session({ status: 'running', stepJobId: 'j1' }), turns: [turn()] }));
    pressable(wrapper)[0]?.press('Use the second plan');
    await flushPromises();
    expect(sends(fake)).toEqual([{ sessionId: 's1', text: 'Use the second plan', sendId: expect.any(String) }]);
    wrapper.unmount();
  });

  it("M5.18-E24 a helper's chat and the streaming answer are given no onMessage", async () => {
    const fake = createFakeKvman();
    const helper = await started(chat({ found: session({ id: 's1', parentId: 'lead' }) }), fake);
    expect(pressable(helper.wrapper)).toEqual([]);
    helper.wrapper.unmount();

    const streaming = await started({ found: session({ status: 'running', stepJobId: 'j1' }), messages: [user('go')], omitted: 0, turns: [turn()] });
    streaming.fake.emit('j1', progress('@kvman/kvai', { type: 'text', delta: block('Streaming') }));
    await flushPromises();
    expect(streaming.wrapper.find('[data-test="live-answer"]').text()).toContain('Streaming');
    expect(pressable(streaming.wrapper)).toEqual([]);
    streaming.wrapper.unmount();
  });

  it('M5.18-E25 a press leaves the send box alone; a failed one says so in a toast, and the next press sends anew', async () => {
    const { fake, wrapper } = await started(chat());
    await wrapper.find('[data-test="composer-text"]').setValue('half typed');
    let failures = 1;
    fake.handle('kvcoder.message.send', () => {
      if (failures-- > 0) throw Object.assign(new Error('offline'), { problem: { code: 'UNAVAILABLE', message: 'Offline.', params: {} } });
      return {};
    });
    pressable(wrapper)[0]?.press('Go');
    await flushPromises();
    expect(fake.toast).toHaveBeenCalledTimes(1);
    expect(wrapper.find<HTMLTextAreaElement>('[data-test="composer-text"]').element.value).toBe('half typed');
    pressable(wrapper)[0]?.press('Go');
    await flushPromises();
    const [first, second] = sends(fake);
    expect(first?.['sendId']).toEqual(expect.any(String));
    expect(second?.['sendId']).not.toBe(first?.['sendId']);
    expect(wrapper.find<HTMLTextAreaElement>('[data-test="composer-text"]').element.value).toBe('half typed');
    wrapper.unmount();
  });
});

describe('openui artifacts in the panel (08 §8.7, ADR 0124, 6 and 13)', () => {
  const withArtifact = (): World => ({
    ...chat({ messages: [user('go'), artifactResult({ id: 'dash', title: 'Dashboard', format: 'openui' })] }),
    artifacts: [artifactSummary({ id: 'dash', title: 'Dashboard', format: 'openui' })],
    artifactContents: { dash: artifactContent({ id: 'dash', title: 'Dashboard', format: 'openui', content: dashboard }) },
  });

  it('M5.18-H17 the panel shows an openui artifact through the openui view, with its kind and its source', async () => {
    const { wrapper } = await started(withArtifact());
    await wrapper.find('[data-test="artifact-open"]').trigger('click');
    await flushPromises();
    const view = wrapper.findAllComponents(MarkdownStub).find((candidate) => candidate.props('view').type === 'openui');
    expect(view?.props('view')).toEqual({ type: 'openui', source: dashboard });
    expect(wrapper.find('[data-test="artifact-format"]').text()).toBe('OpenUI');
    await wrapper.find('[data-test="artifact-view-source"]').trigger('click');
    expect(wrapper.find('[data-test="artifact-source"]').element.textContent).toBe(dashboard);
    wrapper.unmount();
  });

  it("M5.18-H20 a press in an openui artifact sends the person's message", async () => {
    const { fake, wrapper } = await started(withArtifact());
    await wrapper.find('[data-test="artifact-open"]').trigger('click');
    await flushPromises();
    const artifact = pressable(wrapper).find((view) => view.text.includes('Release'));
    artifact?.press('Ship it');
    await flushPromises();
    expect(sends(fake)).toEqual([{ sessionId: 's1', text: 'Ship it', sendId: expect.any(String) }]);
    wrapper.unmount();
  });
});
