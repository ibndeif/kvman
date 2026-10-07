import { describe, expect, it } from 'vitest';
import ConversationView from '../../web/src/ConversationView.vue';
import { createFakeKvman } from './support/fake-kvman.ts';
import { mounted, serve, session, turn, user } from './support/fixtures.ts';

const world = { found: session(), messages: [user('go')], omitted: 0, turns: [turn()] };

describe('the header says how full the context is (08 §8.7, ADR 0034, 9)', () => {
  it('QA46-H10 and QA47-H6 the header has the time, the cost, and how full the memory is, with the tokens in tooltips, in the page language', async () => {
    const fake = createFakeKvman();
    serve(fake, { ...world, context: { tokens: 116_285, window: 272_000, compactAt: 0.8 } });
    const english = await mounted(ConversationView, fake, { sessionId: 's1' });
    const memory = english.find('[data-test="session-context"]');
    expect(english.find('.kvc-header-stats').text()).toBe('48 s · $0.02 · Memory 43% full');
    expect(memory.attributes('title')).toBe('The model now holds 116.3K of its 272K tokens. Older messages are summarized at 80%.');
    expect(english.find('[data-test="session-totals"]').attributes('title')).toBe('Turns: 1 · 1.5K tokens used');
    fake.language.value = 'ar';
    const arabic = await mounted(ConversationView, fake, { sessionId: 's1' });
    expect(arabic.find('[data-test="session-context"]').text()).toBe('الذاكرة ممتلئة 43%');
    expect(arabic.find('[data-test="session-context"]').attributes('title')).toMatch(/^يحمل النموذج الآن .+ من .+ توكن\. تُلخَّص الرسائل الأقدم عند 80%\.$/);
  });

  it('QA46-E6 with no known window there is no context line', async () => {
    const fake = createFakeKvman();
    serve(fake, { ...world, context: { tokens: 500, window: null, compactAt: 0.8 } });
    const wrapper = await mounted(ConversationView, fake, { sessionId: 's1' });
    expect(wrapper.find('[data-test="session-totals"]').exists()).toBe(true);
    expect(wrapper.find('[data-test="session-context"]').exists()).toBe(false);
  });
});
