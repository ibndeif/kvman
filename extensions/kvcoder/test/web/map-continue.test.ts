import { flushPromises } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import ConversationView from '../../web/src/ConversationView.vue';
import { createFakeKvman } from './support/fake-kvman.ts';
import { executionMap, mapStep, mounted, serve, session, turn, user } from './support/fixtures.ts';

// The Continue button under the steps not done (08 §8.7, ADR 0092, 1).
const steps = () => [mapStep('read', { status: 'done', evidence: 'Read it all.' }), mapStep('build', { after: ['read'] })];

describe('Continue under the steps not done (ADR 0092, 1)', () => {
  it('QA60-H2 Continue sends "Continue." as the person\'s message, in the page\'s language', async () => {
    const fake = createFakeKvman();
    fake.handle('kvcoder.message.send', () => ({}));
    serve(fake, { found: session(), messages: [user('go')], omitted: 0, turns: [turn({ outcome: 'done', endedAt: '2026-10-01T09:01:00.000Z' })], map: executionMap(steps()) });
    const view = await mounted(ConversationView, fake, { sessionId: 's1' });
    await view.find('[data-test="map-continue"]').trigger('click');
    await flushPromises();
    expect(fake.calls.filter((call) => call.name === 'kvcoder.message.send').map((call) => call.input['text'])).toEqual(['Continue.']);
    view.unmount();
  });
});
