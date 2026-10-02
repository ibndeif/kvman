import { flushPromises } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import ConversationView from '../../web/src/ConversationView.vue';
import { createFakeKvman, type FakeKvman } from './support/fake-kvman.ts';
import { message, mounted, serve, session, turn, user, type World } from './support/fixtures.ts';

const providers = [
  { id: 'zed', title: 'Zed AI', status: 'ready' },
  { id: 'fake', title: 'Fake', status: 'ready' },
];
const models = [
  { id: 'zed/z1', name: 'Z1', provider: 'zed' },
  { id: 'fake/m1', name: 'M1', provider: 'fake' },
];

function failedWorld(code: string, status: 'idle' | 'running' | 'waiting' = 'idle'): World {
  return {
    found: session({ status }),
    messages: [user('go'), message('notice', { code, params: { code: 'kvai/RATE_LIMITED' } })],
    omitted: 0,
    turns: [turn()],
  };
}

function recoverableFake(world: World): FakeKvman {
  const fake = createFakeKvman();
  serve(fake, world);
  fake.handle('kvai.provider.list', () => providers);
  fake.handle('kvai.model.list', () => models);
  return fake;
}

const problem = (code: string): Error => Object.assign(new Error(`${code}.`), { problem: { code, message: `${code}.`, params: {} } });

async function pickModel(wrapper: Awaited<ReturnType<typeof mounted>>, modelId: string): Promise<void> {
  await wrapper.find('[data-test="recovery"] [data-test="model-picker"]').trigger('click');
  await wrapper.find(`[data-test="recovery"] [data-test="model-${modelId}"]`).trigger('click');
  await flushPromises();
}

describe("a failed turn's recovery (08 §8.7, ADR 0009, 204, 205)", () => {
  it('QA10-H4 a failed turn shows Retry and Choose another model', async () => {
    for (const code of ['STEP_FAILED', 'REPLY_LOST', 'INTERRUPTED']) {
      const fake = recoverableFake(failedWorld(code));
      fake.handle('kvcoder.message.send', () => ({}));
      const wrapper = await mounted(ConversationView, fake, { sessionId: 's1' });
      expect(wrapper.find('[data-test="recovery"]').exists()).toBe(true);
      expect(wrapper.find('[data-test="retry"]').text()).toBe('Retry');
      expect(wrapper.find('[data-test="recovery"] [data-test="model-picker"]').text()).toBe('Choose another model');
      wrapper.unmount();
    }
  });

  it('QA10-H5 Retry sends "Continue", and the conversation reads again', async () => {
    const world = failedWorld('STEP_FAILED');
    const fake = recoverableFake(world);
    fake.handle('kvcoder.message.send', () => ({}));
    const wrapper = await mounted(ConversationView, fake, { sessionId: 's1' });
    const reads = (): number => fake.calls.filter((call) => call.name === 'kvcoder.message.list').length;
    const before = reads();
    await wrapper.find('[data-test="retry"]').trigger('click');
    await flushPromises();
    expect(fake.calls).toContainEqual({ name: 'kvcoder.message.send', input: { sessionId: 's1', text: 'Continue' } });
    expect(reads()).toBeGreaterThan(before);
    wrapper.unmount();

    const arabic = recoverableFake(failedWorld('STEP_FAILED'));
    arabic.language.value = 'ar';
    arabic.handle('kvcoder.message.send', () => ({}));
    const translated = await mounted(ConversationView, arabic, { sessionId: 's1' });
    await translated.find('[data-test="retry"]').trigger('click');
    await flushPromises();
    expect(arabic.calls).toContainEqual({ name: 'kvcoder.message.send', input: { sessionId: 's1', text: 'تابع' } });
    translated.unmount();
  });

  it('QA10-H6 choosing a model sets it on the chat, remembers it, and sends Continue', async () => {
    const fake = recoverableFake(failedWorld('REPLY_LOST'));
    fake.handle('kvcoder.session.configure', () => ({}));
    fake.handle('kernel.settings.set', () => ({}));
    fake.handle('kvcoder.message.send', () => ({}));
    const wrapper = await mounted(ConversationView, fake, { sessionId: 's1' });
    await pickModel(wrapper, 'zed/z1');
    expect(fake.calls.filter((call) => ['kvcoder.session.configure', 'kernel.settings.set', 'kvcoder.message.send'].includes(call.name))).toEqual([
      { name: 'kvcoder.session.configure', input: { sessionId: 's1', model: 'zed/z1' } },
      { name: 'kernel.settings.set', input: { key: 'kvai.defaultModel', value: 'zed/z1', scope: 'global' } },
      { name: 'kvcoder.message.send', input: { sessionId: 's1', text: 'Continue' } },
    ]);
    wrapper.unmount();
  });

  it('QA10-E2 the actions show only on the last message of an idle chat', async () => {
    const followed = failedWorld('STEP_FAILED');
    followed.messages.push(user('never mind'));
    const cases: World[] = [
      followed,
      failedWorld('STEP_FAILED', 'running'),
      failedWorld('STEP_FAILED', 'waiting'),
      failedWorld('CANCELLED'),
      failedWorld('MAX_STEPS'),
      failedWorld('SUMMARY_FAILED'),
    ];
    for (const world of cases) {
      const fake = recoverableFake(world);
      fake.handle('kvcoder.message.send', () => ({}));
      const wrapper = await mounted(ConversationView, fake, { sessionId: 's1' });
      expect(wrapper.find('[data-test="recovery"]').exists()).toBe(false);
      wrapper.unmount();
    }
  });

  it('QA10-E3 the actions leave when the turn starts', async () => {
    const world = failedWorld('STEP_FAILED');
    const fake = recoverableFake(world);
    fake.handle('kvcoder.message.send', () => {
      world.found = session({ status: 'running', stepJobId: 'j1' });
      return {};
    });
    const wrapper = await mounted(ConversationView, fake, { sessionId: 's1' });
    expect(wrapper.find('[data-test="recovery"]').exists()).toBe(true);
    await wrapper.find('[data-test="retry"]').trigger('click');
    await flushPromises();
    expect(fake.calls).toContainEqual({ name: 'kvcoder.message.send', input: { sessionId: 's1', text: 'Continue' } });
    expect(wrapper.find('[data-test="recovery"]').exists()).toBe(false);
    fake.end('j1');
    await flushPromises();
    wrapper.unmount();
  });

  it('QA10-E4 a failing configure stops the recovery with a toast, while a failing default write still sends Continue', async () => {
    const stuck = recoverableFake(failedWorld('STEP_FAILED'));
    stuck.handle('kvcoder.session.configure', () => Promise.reject(problem('kvcoder/SESSION_BUSY')));
    stuck.handle('kernel.settings.set', () => ({}));
    stuck.handle('kvcoder.message.send', () => ({}));
    const blocked = await mounted(ConversationView, stuck, { sessionId: 's1' });
    await pickModel(blocked, 'zed/z1');
    expect(stuck.toast).toHaveBeenCalledWith('kvcoder.errors.SESSION_BUSY', {}, 'error');
    expect(stuck.calls.map((call) => call.name)).not.toContain('kernel.settings.set');
    expect(stuck.calls.map((call) => call.name)).not.toContain('kvcoder.message.send');
    expect(blocked.find('[data-test="recovery"]').exists()).toBe(true);
    blocked.unmount();

    const kept = recoverableFake(failedWorld('STEP_FAILED'));
    kept.handle('kvcoder.session.configure', () => ({}));
    kept.handle('kernel.settings.set', () => Promise.reject(problem('VALIDATION_FAILED')));
    kept.handle('kvcoder.message.send', () => ({}));
    const wrapper = await mounted(ConversationView, kept, { sessionId: 's1' });
    await pickModel(wrapper, 'zed/z1');
    expect(kept.toast).toHaveBeenCalledWith('kernel.errors.VALIDATION_FAILED', {}, 'error');
    expect(kept.calls).toContainEqual({ name: 'kvcoder.session.configure', input: { sessionId: 's1', model: 'zed/z1' } });
    expect(kept.calls).toContainEqual({ name: 'kvcoder.message.send', input: { sessionId: 's1', text: 'Continue' } });
    expect(wrapper.find('[data-test="recovery"]').exists()).toBe(true);
    wrapper.unmount();
  });
});
