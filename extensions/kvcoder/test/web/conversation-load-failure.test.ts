import { flushPromises } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import ConversationView from '../../web/src/ConversationView.vue';
import { createFakeKvman } from './support/fake-kvman.ts';
import { answer, mounted, serve, session, turn, user } from './support/fixtures.ts';

const tooLarge = () => Object.assign(new Error('The output of kvcoder.message.list is over 1048576 bytes of JSON.'), { problem: { code: 'TOO_LARGE', message: 'Too large.', params: { limit: 1_048_576 } } });

describe("a conversation that can't load (08 §8.7, ADR 0034, 10)", () => {
  it('QA46-E7 the page keeps the header, says why, loads again on Try again, and offers the export', async () => {
    const fake = createFakeKvman();
    const messages = [user('go'), answer('the answer')];
    serve(fake, { found: session(), messages, omitted: 0, turns: [turn()] });
    fake.handle('kvcoder.message.list', () => {
      throw tooLarge();
    });
    fake.handle('kvcoder.session.export', () => ({ fileId: 'f1' }));
    const wrapper = await mounted(ConversationView, fake, { sessionId: 's1' });
    expect(wrapper.find('[data-test="session-title"]').text()).toBe('Notes page');
    const failure = wrapper.find('[data-test="load-failure"]');
    expect(failure.find('p').text()).toBe(`This chat couldn't be loaded: ${fake.kvman.t('kernel.errors.TOO_LARGE', { limit: '1048576' })}`);
    expect(fake.toast).not.toHaveBeenCalled();
    await failure.find('[data-test="load-export"]').trigger('click');
    await flushPromises();
    expect(fake.calls.some((call) => call.name === 'kvcoder.session.export')).toBe(true);

    fake.handle('kvcoder.message.list', () => ({ messages, omitted: 0 }));
    await failure.find('[data-test="load-again"]').trigger('click');
    await flushPromises();
    expect(wrapper.find('[data-test="load-failure"]').exists()).toBe(false);
    expect(wrapper.findAll('[data-test="markdown"]').map((node) => node.text())).toEqual(['the answer']);
  });
});
