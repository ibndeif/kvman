import { describe, expect, it } from 'vitest';
import MessageItem from '../../web/src/MessageItem.vue';
import { createFakeKvman } from './support/fake-kvman.ts';
import { message, mounted, user } from './support/fixtures.ts';

describe("kvcoder's word to the model and its notice of a lost reply (08 §8.7, ADR 0009, 188)", () => {
  it('QA8-H7 the hint is a muted card labelled kvcoder told the model, not the person\'s bubble, and the person\'s own message still is a bubble', async () => {
    const fake = createFakeKvman();
    const hint = user('Your last reply was lost on the way.', { source: { kind: 'extension', name: '@kvman/kvcoder' } });
    const wrapper = await mounted(MessageItem, fake, { message: hint, calls: new Map() });
    expect(wrapper.find('[data-test="kvcoder-hint"] summary').text()).toBe('kvcoder told the model');
    expect(wrapper.find('[data-test="kvcoder-hint"]').text()).toContain('Your last reply was lost on the way.');
    expect(wrapper.find('[data-test="user-message"]').exists()).toBe(false);
    const own = await mounted(MessageItem, fake, { message: user('go on', { source: { kind: 'user' } }), calls: new Map() });
    expect(own.find('[data-test="user-message"]').exists()).toBe(true);
    expect(own.find('[data-test="kvcoder-hint"]').exists()).toBe(false);
    const other = await mounted(MessageItem, fake, { message: user('from an extension', { source: { kind: 'extension', name: '@test/todo' } }), calls: new Map() });
    expect(other.find('[data-test="user-message"]').exists()).toBe(true);
  });

  it('QA8-H8 the REPLY_LOST notice is translated, in English and in Arabic', async () => {
    const fake = createFakeKvman();
    const notice = message('notice', { code: 'REPLY_LOST', params: { tokens: 3575 } });
    const english = await mounted(MessageItem, fake, { message: notice, calls: new Map() });
    expect(english.find('[data-test="notice"]').text()).toBe("The model's reply was lost on the way, again and again (about 3575 tokens never arrived). Say continue to try again, or choose another model.");
    fake.language.value = 'ar';
    const arabic = await mounted(MessageItem, fake, { message: notice, calls: new Map() });
    expect(arabic.find('[data-test="notice"]').text()).toContain('حوالي 3575 رمز');
  });
});
