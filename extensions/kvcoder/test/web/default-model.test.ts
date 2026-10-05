import { flushPromises } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import SessionModel from '../../web/src/SessionModel.vue';
import { createFakeKvman, type FakeKvman } from './support/fake-kvman.ts';
import { mounted, session } from './support/fixtures.ts';

const providers = [
  { id: 'zed', title: 'Zed AI', status: 'ready' },
  { id: 'fake', title: 'Fake', status: 'ready' },
];
const models = [
  { id: 'zed/z1', name: 'Z1', provider: 'zed' },
  { id: 'fake/m1', name: 'M1', provider: 'fake' },
];

function headerFake(): FakeKvman {
  const fake = createFakeKvman();
  fake.handle('kvai.provider.list', () => providers);
  fake.handle('kvai.model.list', () => models);
  fake.handle('kvcoder.job.list', () => []);
  fake.handle('kvcoder.session.configure', () => ({}));
  fake.handle('kernel.settings.set', () => ({}));
  return fake;
}

async function pickModel(wrapper: Awaited<ReturnType<typeof mounted>>, modelId: string): Promise<void> {
  await wrapper.find('[data-test="model-picker"]').trigger('click');
  await wrapper.find(`[data-test="model-${modelId}"]`).trigger('click');
  await flushPromises();
}

describe("picking a model makes it the default (ADR 0009, 205)", () => {
  it('QA10-H7 picking a model in the send box configures the chat and remembers the default; a thinking level only configures', async () => {
    const fake = headerFake();
    const wrapper = await mounted(SessionModel, fake, { session: session({ model: 'fake/m1' }) });
    await pickModel(wrapper, 'zed/z1');
    expect(fake.calls.filter((call) => call.name === 'kvcoder.session.configure' || call.name === 'kernel.settings.set')).toEqual([
      { name: 'kvcoder.session.configure', input: { sessionId: 's1', model: 'zed/z1' } },
      { name: 'kernel.settings.set', input: { key: 'kvai.defaultModel', value: 'zed/z1', scope: 'global' } },
    ]);
    expect(wrapper.emitted('changed')?.length).toBe(1);

    await wrapper.find('[data-test="thinking-picker"]').setValue('low');
    await flushPromises();
    expect(fake.calls.filter((call) => call.name === 'kvcoder.session.configure')).toEqual([
      { name: 'kvcoder.session.configure', input: { sessionId: 's1', model: 'zed/z1' } },
      { name: 'kvcoder.session.configure', input: { sessionId: 's1', thinking: 'low' } },
    ]);
    expect(fake.calls.filter((call) => call.name === 'kernel.settings.set')).toHaveLength(1);
    expect(wrapper.emitted('changed')?.length).toBe(2);
    wrapper.unmount();
  });

  it('QA10-E5 a failed default write toasts but keeps the picked model on the chat', async () => {
    const fake = headerFake();
    fake.handle('kernel.settings.set', () => Promise.reject(Object.assign(new Error('Gone.'), { problem: { code: 'VALIDATION_FAILED', message: 'Gone.', params: {} } })));
    const wrapper = await mounted(SessionModel, fake, { session: session({ model: 'fake/m1' }) });
    await pickModel(wrapper, 'zed/z1');
    expect(fake.toast).toHaveBeenCalledWith('kernel.errors.VALIDATION_FAILED', {}, 'error');
    expect(fake.calls).toContainEqual({ name: 'kvcoder.session.configure', input: { sessionId: 's1', model: 'zed/z1' } });
    expect(wrapper.emitted('changed')?.length).toBe(1);
    wrapper.unmount();
  });

  it('QA10-E6 picking the model already in use still configures and remembers it', async () => {
    const fake = headerFake();
    const wrapper = await mounted(SessionModel, fake, { session: session({ model: 'zed/z1' }) });
    await pickModel(wrapper, 'zed/z1');
    expect(fake.calls.filter((call) => call.name === 'kvcoder.session.configure' || call.name === 'kernel.settings.set')).toEqual([
      { name: 'kvcoder.session.configure', input: { sessionId: 's1', model: 'zed/z1' } },
      { name: 'kernel.settings.set', input: { key: 'kvai.defaultModel', value: 'zed/z1', scope: 'global' } },
    ]);
    expect(wrapper.emitted('changed')?.length).toBe(1);
    wrapper.unmount();
  });
});
