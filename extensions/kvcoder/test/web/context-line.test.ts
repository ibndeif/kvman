import { describe, expect, it } from 'vitest';
import ConversationView from '../../web/src/ConversationView.vue';
import { createFakeKvman } from './support/fake-kvman.ts';
import { mounted, serve, session, turn, user } from './support/fixtures.ts';

const world = { found: session(), messages: [user('go')], omitted: 0, turns: [turn()] };

describe('the header says how full the context is (08 §8.7, ADR 0034, 9)', () => {
  it('QA46-H10 the context line has the share of the window and where the summary happens, in the page language', async () => {
    const fake = createFakeKvman();
    serve(fake, { ...world, context: { tokens: 116_285, window: 272_000, compactAt: 0.8 } });
    const english = await mounted(ConversationView, fake, { sessionId: 's1' });
    expect(english.find('[data-test="session-context"]').text()).toBe('Context 43% of 272K · summary at 80%');
    fake.language.value = 'ar';
    const arabic = await mounted(ConversationView, fake, { sessionId: 's1' });
    expect(arabic.find('[data-test="session-context"]').text()).toMatch(/^السياق 43% من .+ · التلخيص عند 80%$/);
  });

  it('QA46-E6 with no known window there is no context line', async () => {
    const fake = createFakeKvman();
    serve(fake, { ...world, context: { tokens: 500, window: null, compactAt: 0.8 } });
    const wrapper = await mounted(ConversationView, fake, { sessionId: 's1' });
    expect(wrapper.find('[data-test="session-totals"]').exists()).toBe(true);
    expect(wrapper.find('[data-test="session-context"]').exists()).toBe(false);
  });
});
