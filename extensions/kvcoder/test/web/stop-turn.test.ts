import { flushPromises } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import type { Turn } from '../../src/index.ts';
import ConversationView from '../../web/src/ConversationView.vue';
import { createFakeKvman, type FakeKvman } from './support/fake-kvman.ts';
import { job, mounted, serve, session, turn, user, type World } from './support/fixtures.ts';

type Wrapper = Awaited<ReturnType<typeof mounted>>;
type Pending = Turn['pending'][number];
const question: Pending = { toolCallId: 'c1', kind: 'question', questionId: 'q1', question: { kind: 'text', prompt: 'Name?' }, childSessionId: null };
const approval: Pending = { toolCallId: 'c2', kind: 'approval', questionId: 'a1', question: { connector: 'shell', command: 'exec', payload: { line: 'ls' } }, childSessionId: null };
const helper: Pending = { toolCallId: 'c3', kind: 'subagent', questionId: null, question: null, childSessionId: 'child' };
const worker: Pending = { toolCallId: 'c4', kind: 'worker', questionId: null, question: null, childSessionId: null, runId: 'r1' };
const busy = () => Object.assign(new Error('busy'), { problem: { code: 'kvcoder/SESSION_BUSY', message: 'busy', params: {} } });
const stopButton = (view: Wrapper) => view.find<HTMLButtonElement>('[data-test="stop"]');
const cancels = (fake: FakeKvman) => fake.calls.filter((call) => call.name === 'kvcoder.turn.cancel').map((call) => call.input);

function waiting(pending: Pending[], fields: Partial<World> = {}): { fake: FakeKvman; world: World } {
  const fake = createFakeKvman();
  const world: World = { found: session({ status: pending.length === 0 ? 'running' : 'waiting' }), messages: [user('go')], omitted: 0, turns: [turn({ pending })], ...fields };
  serve(fake, world);
  fake.handle('kvcoder.run.get', () => ({ id: 'r1', status: 'running', worker: 'codex', task: 'Do it', output: '' }));
  return { fake, world };
}

describe('Stop for every unfinished turn (KVC-21, ADR 0049)', () => {
  it('M2.4-E143 Stop shows while the turn runs or waits on anything, and not when it is idle', async () => {
    for (const pending of [[], [question], [approval], [helper], [worker]]) {
      const view = await mounted(ConversationView, waiting(pending).fake, { sessionId: 's1' });
      expect(stopButton(view).exists(), pending[0]?.kind ?? 'running').toBe(true);
      view.unmount();
    }
    const { fake, world } = waiting([]);
    world.found = session({ status: 'idle' });
    world.turns = [turn({ outcome: 'done', endedAt: '2026-10-01T09:01:00.000Z' })];
    const idle = await mounted(ConversationView, fake, { sessionId: 's1' });
    expect(stopButton(idle).exists()).toBe(false);
    idle.unmount();
  });

  it("M2.4-E143 Stop cancels the displayed turn once, and reads Stopping… until the reply", async () => {
    const { fake, world } = waiting([question]);
    let finish: (value: object) => void = () => undefined;
    fake.handle('kvcoder.turn.cancel', () => new Promise((resolve) => { finish = resolve; }));
    const view = await mounted(ConversationView, fake, { sessionId: 's1' });
    expect(stopButton(view).text()).toBe('Stop');
    await stopButton(view).trigger('click');
    expect(stopButton(view).element.disabled).toBe(true);
    expect(stopButton(view).text()).toBe('Stopping…');
    await stopButton(view).trigger('click');
    expect(cancels(fake)).toEqual([{ sessionId: 's1', turnId: 't1' }]);
    world.found = session({ status: 'idle' });
    world.turns = [turn({ outcome: 'cancelled', endedAt: '2026-10-01T09:01:00.000Z' })];
    finish({});
    await flushPromises();
    expect(stopButton(view).exists()).toBe(false);
    view.unmount();
  });

  it('M2.4-E144 a failed Stop says so above the box and can be pressed again; a late reply changes nothing in another chat', async () => {
    const { fake } = waiting([question]);
    const replies: ((error: Error) => void)[] = [];
    fake.handle('kvcoder.turn.cancel', () => new Promise((_resolve, reject) => { replies.push(reject); }));
    const view = await mounted(ConversationView, fake, { sessionId: 's1' });
    await stopButton(view).trigger('click');
    replies[0]?.(busy());
    await flushPromises();
    expect(view.find('[data-test="stop-error"]').text()).toContain('The chat is working');
    expect(fake.toast).not.toHaveBeenCalled();
    expect(stopButton(view).element.disabled).toBe(false);
    await stopButton(view).trigger('click');
    expect(cancels(fake)).toHaveLength(2);
    expect(view.find('[data-test="stop-error"]').exists()).toBe(false);
    fake.handle('kvcoder.session.get', (input) => session({ id: String(input['sessionId']), status: 'running' }));
    fake.handle('kvcoder.turn.list', (input) => [turn({ id: 't2', sessionId: String(input['sessionId']) })]);
    await view.setProps({ sessionId: 's2' });
    await flushPromises();
    replies[1]?.(busy());
    await flushPromises();
    expect(view.find('[data-test="stop-error"]').exists()).toBe(false);
    expect(stopButton(view).element.disabled).toBe(false);
    expect(fake.toast).not.toHaveBeenCalled();
    view.unmount();
  });

  it('M2.4-E144 the waiting hint says what Stop does, and names background jobs only when one runs', async () => {
    const plain = await mounted(ConversationView, waiting([question]).fake, { sessionId: 's1' });
    expect(plain.find('[data-test="waiting-hint"]').text()).toBe('Sending a message skips the questions and denies the commands. Stop ends the turn; its helpers stop too.');
    plain.unmount();
    const alone = await mounted(ConversationView, waiting([helper]).fake, { sessionId: 's1' });
    expect(alone.find('[data-test="waiting-hint"]').text()).toBe('Stop ends the turn; its helpers stop too.');
    alone.unmount();
    const withJob = await mounted(ConversationView, waiting([question], { jobs: [job()] }).fake, { sessionId: 's1' });
    expect(withJob.find('[data-test="waiting-hint"]').text()).toContain('Background jobs keep running.');
    withJob.unmount();
    const ended = await mounted(ConversationView, waiting([question], { jobs: [job({ status: 'succeeded' })] }).fake, { sessionId: 's1' });
    expect(ended.find('[data-test="waiting-hint"]').text()).not.toContain('Background');
    ended.unmount();
  });
});
