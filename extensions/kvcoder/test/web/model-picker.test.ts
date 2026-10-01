import { describe, expect, it } from 'vitest';
import ConversationHeader from '../../web/src/ConversationHeader.vue';
import { createFakeKvman } from './support/fake-kvman.ts';
import { mounted, session } from './support/fixtures.ts';

const providers = [
  { id: 'zed', title: 'Zed AI', status: 'ready' },
  { id: 'fake', title: 'Fake', status: 'noKey' },
  { id: 'locked', title: 'Locked', status: 'needsKey' },
];
const models = [
  { id: 'zed/z1', name: 'Z1', provider: 'zed' },
  { id: 'fake/m1', name: 'M1', provider: 'fake' },
  { id: 'locked/l1', name: 'L1', provider: 'locked' },
  { id: 'locked/l2', name: 'L2', provider: 'locked' },
];

async function headerFor(model: string) {
  const fake = createFakeKvman();
  fake.handle('kvai.provider.list', () => providers);
  fake.handle('kvai.model.list', () => models);
  return mounted(ConversationHeader, fake, { session: session({ model }), tab: 'chat', turns: 1 });
}

describe("the header's model picker (ADR 0009, 136)", () => {
  it('QA1-H7 groups the models of callable providers by provider title', async () => {
    const wrapper = await headerFor('fake/m1');
    const groups = wrapper.findAll('[data-test="model-picker"] optgroup');
    expect(groups.map((group) => group.attributes('label'))).toEqual(['Fake', 'Zed AI']);
    expect(wrapper.findAll('[data-test="model-picker"] option').map((option) => option.text())).toEqual(['M1', 'Z1']);
    wrapper.unmount();
  });

  it("QA1-E2 the session's own model stays listed when its provider has no key", async () => {
    const wrapper = await headerFor('locked/l2');
    expect(wrapper.findAll('[data-test="model-picker"] optgroup').map((group) => group.attributes('label'))).toEqual(['Fake', 'Locked', 'Zed AI']);
    expect(wrapper.findAll('[data-test="model-picker"] option').map((option) => option.text())).toEqual(['M1', 'L2', 'Z1']);
    expect((wrapper.find('[data-test="model-picker"]').element as HTMLSelectElement).value).toBe('locked/l2');
    wrapper.unmount();
  });
});
