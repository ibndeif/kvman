import { flushPromises } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import ConversationView from '../../web/src/ConversationView.vue';
import { createFakeKvman } from './support/fake-kvman.ts';
import { job, message, mounted, serve, session, turn, user } from './support/fixtures.ts';

type Staging = { state: 'changed' | 'restored'; paths: number; headMoved: boolean };

const result = message('toolResult', {
  role: 'toolResult',
  toolCallId: 'c1',
  toolName: 'run',
  content: [{ type: 'text', text: 'staged' }],
  isError: false,
  details: { description: 'Writing the retry test.', connector: 'delegate', command: 'run', output: 'staged', durationMs: 1000, staging: { runId: 'r1' } },
});

async function shown(staging: Staging) {
  const fake = createFakeKvman();
  const run = { ...job({ id: 'r1', kind: 'worker', title: 'opencode', call: 'Writing the retry test.', status: 'succeeded' }), staging };
  serve(fake, { found: session({ status: 'idle' }), messages: [user('go'), result], omitted: 0, turns: [turn({ outcome: 'done' })], jobs: [run] });
  fake.handle('kvcoder.job.get', () => run);
  fake.handle('kvcoder.delegate.staging.restore', () => ({}));
  const wrapper = await mounted(ConversationView, fake, { sessionId: 's1' });
  await flushPromises();
  return { fake, wrapper, note: () => wrapper.find('[data-test="staging-note"]') };
}

describe("the note of a run that changed what is staged in Git (08 §8.7, ADR 0060, 4)", () => {
  it('M2.4-E200 the result card of such a run shows the note and Restore staging, which runs the command and then says it was restored', async () => {
    const { fake, wrapper, note } = await shown({ state: 'changed', paths: 3, headMoved: false });
    expect(note().find('[data-test="staging-changed"]').text()).toBe('This run changed what is staged in Git (3 paths).');
    await note().find('[data-test="staging-restore"]').trigger('click');
    await flushPromises();
    expect(fake.calls.filter((call) => call.name === 'kvcoder.delegate.staging.restore').map((call) => call.input)).toEqual([{ sessionId: 's1', runId: 'r1' }]);
    expect(note().text()).toBe('Staging restored.');
    expect(note().find('[data-test="staging-restore"]').exists()).toBe(false);
    wrapper.unmount();
  });

  it('M2.4-E200 a run that moved HEAD says that it cannot be restored here and has no button; a result without the detail has no note', async () => {
    const moved = await shown({ state: 'changed', paths: 1, headMoved: true });
    expect(moved.note().find('[data-test="staging-head-moved"]').text()).toBe("This run moved HEAD, so staging can't be restored here.");
    expect(moved.note().find('[data-test="staging-restore"]').exists()).toBe(false);
    moved.wrapper.unmount();

    const fake = createFakeKvman();
    const plain = message('toolResult', { ...result.content, details: { description: 'Writing.', connector: 'delegate', command: 'run', output: 'done', durationMs: 1000 } });
    serve(fake, { found: session({ status: 'idle' }), messages: [user('go'), plain], omitted: 0, turns: [turn({ outcome: 'done' })] });
    const wrapper = await mounted(ConversationView, fake, { sessionId: 's1' });
    await flushPromises();
    expect(wrapper.find('[data-test="staging-note"]').exists()).toBe(false);
    wrapper.unmount();
  });
});
