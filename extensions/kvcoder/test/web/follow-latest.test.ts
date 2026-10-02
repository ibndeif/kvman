import { flushPromises } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import { nextTick, ref, type Ref } from 'vue';
import ConversationView from '../../web/src/ConversationView.vue';
import { useFollowLatest } from '../../web/src/use-follow-latest.ts';
import { createFakeKvman, progress } from './support/fake-kvman.ts';
import { mounted, serve, session, turn, user } from './support/fixtures.ts';

function elementAt(height: number, shown: number, top: number): { element: HTMLElement; list: Ref<HTMLElement | null> } {
  const element = { scrollHeight: height, clientHeight: shown, scrollTop: top } as unknown as HTMLElement;
  const list: Ref<HTMLElement | null> = ref(element);
  return { element, list };
}

function scrolled(wrapper: Awaited<ReturnType<typeof mounted>>, height: number, shown: number, top: number): HTMLElement {
  const element = wrapper.find('.kvc-scroll').element as HTMLElement;
  Object.defineProperty(element, 'scrollHeight', { configurable: true, value: height });
  Object.defineProperty(element, 'clientHeight', { configurable: true, value: shown });
  Object.defineProperty(element, 'scrollTop', { configurable: true, writable: true, value: top });
  return element;
}

describe('following the newest message (ADR 0009, 199)', () => {
  it('QA9-H16 while at the end, a message, streamed text, and the activity line keep the view at the end', async () => {
    const { element, list } = elementAt(1000, 400, 600);
    const messages = ref(0);
    const text = ref('');
    const calls = ref(0);
    const place = ref('s1');
    useFollowLatest(list, () => [messages.value, text.value, calls.value], () => place.value);
    messages.value += 1;
    await flushPromises();
    expect(element.scrollTop).toBe(1000);
    element.scrollTop = 600;
    text.value = 'Hello';
    await flushPromises();
    expect(element.scrollTop).toBe(1000);
    element.scrollTop = 600;
    calls.value += 1;
    await flushPromises();
    expect(element.scrollTop).toBe(1000);
  });

  it('QA9-H17 scrolling up stops following; the button and sending resume it', async () => {
    const fake = createFakeKvman();
    const world = { found: session({ status: 'running', stepJobId: 'j1' }), messages: [user('go')], omitted: 0, turns: [turn()] };
    serve(fake, world);
    fake.handle('kvcoder.message.send', () => ({}));
    const wrapper = await mounted(ConversationView, fake, { sessionId: 's1' });
    const element = scrolled(wrapper, 2000, 400, 1600);
    await wrapper.find('.kvc-scroll').trigger('scroll');
    expect(wrapper.find('[data-test="jump-to-latest"]').exists()).toBe(false);

    element.scrollTop = 100;
    await wrapper.find('.kvc-scroll').trigger('scroll');
    expect(wrapper.find('[data-test="jump-to-latest"]').text()).toBe('Jump to latest');
    fake.emit('j1', progress('@kvman/kvai', { type: 'text', delta: 'Hello' } as never));
    await flushPromises();
    expect(element.scrollTop).toBe(100);
    expect(wrapper.find('[data-test="jump-to-latest"]').exists()).toBe(true);

    await wrapper.find('[data-test="jump-to-latest"]').trigger('click');
    expect(element.scrollTop).toBe(2000);
    expect(wrapper.find('[data-test="jump-to-latest"]').exists()).toBe(false);

    element.scrollTop = 100;
    await wrapper.find('.kvc-scroll').trigger('scroll');
    await wrapper.find('[data-test="composer-text"]').setValue('go on');
    await wrapper.find('[data-test="send"]').trigger('click');
    await flushPromises();
    expect(element.scrollTop).toBe(2000);
    expect(wrapper.find('[data-test="jump-to-latest"]').exists()).toBe(false);
    fake.end('j1');
    await nextTick();
    wrapper.unmount();
  });

  it('QA9-E9 the follow threshold is exact: 80 px follows, 81 px does not', async () => {
    const { element, list } = elementAt(1000, 400, 520);
    const feed = ref(0);
    const place = ref('s1');
    const follow = useFollowLatest(list, () => feed.value, () => place.value);
    follow.onScroll();
    expect(follow.away.value).toBe(false);
    feed.value += 1;
    await flushPromises();
    expect(element.scrollTop).toBe(1000);

    element.scrollTop = 519;
    follow.onScroll();
    expect(follow.away.value).toBe(true);
    feed.value += 1;
    await flushPromises();
    expect(element.scrollTop).toBe(519);
  });

  it('QA9-E10 opening another chat lands at its end and follows again', async () => {
    const { element, list } = elementAt(1000, 400, 100);
    const feed = ref(0);
    const place = ref('sA');
    const follow = useFollowLatest(list, () => feed.value, () => place.value);
    follow.onScroll();
    expect(follow.away.value).toBe(true);
    place.value = 'sB';
    await flushPromises();
    expect(follow.away.value).toBe(false);
    expect(element.scrollTop).toBe(1000);
    feed.value += 1;
    await flushPromises();
    expect(element.scrollTop).toBe(1000);
  });

  it('QA9-E11 a short chat has no jump button', async () => {
    const fake = createFakeKvman();
    serve(fake, { found: session(), messages: [user('hi')], omitted: 0, turns: [] });
    const wrapper = await mounted(ConversationView, fake, { sessionId: 's1' });
    expect(wrapper.find('[data-test="jump-to-latest"]').exists()).toBe(false);
    scrolled(wrapper, 300, 400, 0);
    await wrapper.find('.kvc-scroll').trigger('scroll');
    expect(wrapper.find('[data-test="jump-to-latest"]').exists()).toBe(false);
    wrapper.unmount();
  });
});
