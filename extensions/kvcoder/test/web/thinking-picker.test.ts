import { flushPromises } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import SessionModel from '../../web/src/SessionModel.vue';
import WorkerForm from '../../web/src/WorkerForm.vue';
import { createFakeKvman, type FakeKvman } from './support/fake-kvman.ts';
import { mounted, session } from './support/fixtures.ts';

// ADR 0087, 11: the thinking pickers list the model's own levels.

const every = ['off', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max'];
const models = [
  { id: 'fake/big', name: 'Big', provider: 'fake', thinkingLevels: every },
  { id: 'fake/m1', name: 'M1', provider: 'fake', thinkingLevels: ['off', 'minimal', 'low', 'medium', 'high'] },
  { id: 'fake/plain', name: 'Plain', provider: 'fake', thinkingLevels: ['off'] },
];

function fakeWith(): FakeKvman {
  const fake = createFakeKvman();
  fake.handle('kvai.provider.list', () => [{ id: 'fake', title: 'Fake', status: 'ready' }]);
  fake.handle('kvai.model.list', () => models);
  fake.handle('kvcoder.job.list', () => []);
  fake.handle('kvcoder.connector.list', () => []);
  return fake;
}

describe('the thinking pickers (ADR 0087, 11)', () => {
  it("QA55-H13 the send box lists the model's levels, and a model that doesn't think shows Off, disabled", async () => {
    const fake = fakeWith();
    const big = await mounted(SessionModel, fake, { session: session({ model: 'fake/big', thinking: 'xhigh' }) });
    const picker = big.find('[data-test="thinking-picker"]');
    expect(picker.text()).toBe('Extra high');
    await picker.trigger('click');
    const listed = big.findAll('[data-test="thinking-picker-list"] [role="option"]').map((option) => option.text());
    expect(listed).toEqual(['Off', 'Minimal', 'Low', 'Medium', 'High', 'Extra high', 'Max']);
    big.unmount();

    const plain = await mounted(SessionModel, fake, { session: session({ model: 'fake/plain', thinking: 'off' }) });
    const off = plain.find('[data-test="thinking-picker"]');
    expect(off.text()).toBe('Off');
    expect(off.attributes('disabled')).toBeDefined();
    plain.unmount();
  });

  it("QA55-E15 a worker on the chat's model lists all seven levels, and one on a model with off to high lists five", async () => {
    const fake = fakeWith();
    const form = await mounted(WorkerForm, fake, { taken: [], working: false });
    const levels = () => form.findAll('[data-test="worker-thinking"] option').map((option) => option.attributes('value')).filter((value) => value !== '');
    expect(levels()).toEqual(every);
    await form.find('[data-test="model-picker"]').trigger('click');
    await form.find('[data-test="model-fake/m1"]').trigger('click');
    await flushPromises();
    expect(levels()).toEqual(['off', 'minimal', 'low', 'medium', 'high']);
    form.unmount();
  });
});
