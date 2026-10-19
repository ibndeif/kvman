import { flushPromises } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import ChatStart from '../../web/src/ChatStart.vue';
import SessionModel from '../../web/src/SessionModel.vue';
import { createFakeKvman } from './support/fake-kvman.ts';
import { mounted, session } from './support/fixtures.ts';

// The "Decide for me" switch in the send box (08 §8.7, ADR 0092, 2).
const configures = (fake: ReturnType<typeof createFakeKvman>) => fake.calls.filter((call) => call.name === 'kvcoder.session.configure').map((call) => call.input);

describe('Decide for me in the send box (ADR 0092, 2)', () => {
  it("QA60-H4 the switch shows the chat's setting and configures it either way", async () => {
    const fake = createFakeKvman();
    fake.handle('kvai.provider.list', () => []);
    fake.handle('kvai.model.list', () => []);
    fake.handle('kvcoder.session.configure', () => ({}));
    const off = await mounted(SessionModel, fake, { session: session({ decides: false }) });
    expect(off.find('[data-test="decide-switch"]').attributes('aria-pressed')).toBe('false');
    expect(off.find('[data-test="decide-switch"]').text()).toBe('Decide for me');
    await off.find('[data-test="decide-switch"]').trigger('click');
    off.unmount();
    const on = await mounted(SessionModel, fake, { session: session({ decides: true }) });
    expect(on.find('[data-test="decide-switch"]').attributes('aria-pressed')).toBe('true');
    await on.find('[data-test="decide-switch"]').trigger('click');
    await flushPromises();
    expect(configures(fake)).toEqual([{ sessionId: 's1', decides: true }, { sessionId: 's1', decides: false }]);
    on.unmount();
  });

  it('QA60-H4 on the Chat page the switch is set on the chat it creates', async () => {
    const fake = createFakeKvman();
    fake.handle('kernel.settings.list', () => [{ key: 'kvcoder.model', value: 'fake/m1' }, { key: 'kvai.defaultModel', value: null }, { key: 'kvcoder.thinking', value: 'medium' }]);
    fake.handle('kvai.provider.list', () => [{ id: 'fake', title: 'Fake', status: 'ready' }]);
    fake.handle('kvai.model.list', () => [{ id: 'fake/m1', name: 'M1', provider: 'fake' }]);
    fake.handle('kvcoder.session.create', () => ({ id: 's9' }));
    fake.handle('kvcoder.session.configure', () => ({}));
    fake.handle('kvcoder.message.send', () => ({}));
    const start = await mounted(ChatStart, fake);
    await start.find('[data-test="decide-switch"]').trigger('click');
    expect(start.find('[data-test="decide-switch"]').attributes('aria-pressed')).toBe('true');
    await start.find('[data-test="composer-text"]').setValue('Build it');
    await start.find('[data-test="composer-text"]').trigger('keydown', { key: 'Enter' });
    await flushPromises();
    expect(configures(fake)).toEqual([{ sessionId: 's9', decides: true }]);
    start.unmount();
  });
});
