import { afterEach, describe, expect, it, vi } from 'vitest';
import ConversationView from '../../web/src/ConversationView.vue';
import { createFakeKvman } from './support/fake-kvman.ts';
import { mounted, serve, session, turn, user } from './support/fixtures.ts';

afterEach(() => {
  vi.useRealTimers();
});

describe("the conversation tells the status bar when a session's status changes (ADR 0009, 138)", () => {
  it('QA2-H1 a reload that finds a new status reruns the status items, and one that finds the same does not', async () => {
    vi.useFakeTimers();
    const fake = createFakeKvman();
    const world = { found: session({ status: 'idle' }), messages: [user('go')], omitted: 0, turns: [turn()] };
    serve(fake, world);
    const wrapper = await mounted(ConversationView, fake, { sessionId: 's1' });
    expect(fake.refresh).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(5000);
    expect(fake.refresh).not.toHaveBeenCalled();

    world.found = session({ status: 'waiting' });
    await vi.advanceTimersByTimeAsync(5000);
    expect(fake.refresh).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(5000);
    expect(fake.refresh).toHaveBeenCalledTimes(1);
    wrapper.unmount();
  });
});
