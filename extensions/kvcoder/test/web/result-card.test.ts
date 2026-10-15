import { describe, expect, it } from 'vitest';
import MessageItem from '../../web/src/MessageItem.vue';
import { createFakeKvman, MarkdownStub } from './support/fake-kvman.ts';
import { message, mounted } from './support/fixtures.ts';

const card = { component: 'notes.item-card', payload: { id: 'n1' }, output: { title: 'Milk' } };
const result = (isError: boolean) =>
  message('toolResult', { role: 'toolResult', toolCallId: 'c1', toolName: 'run', content: [{ type: 'text', text: '{"title":"Milk"}' }], isError, details: { description: 'Show the note.', connector: 'notes', command: 'show', output: '{"title":"Milk"}', durationMs: 3, ...(isError ? {} : { card }) } });

describe("an extension's own card (08 §8.7, ADR 0082, 13)", () => {
  it("QA52-H14 a successful call with a card shows the extension's component with its payload and output, not the call card", async () => {
    const wrapper = await mounted(MessageItem, createFakeKvman(), { message: result(false), calls: new Map() });
    expect(wrapper.find('[data-test="extension-card"]').exists()).toBe(true);
    expect(wrapper.findComponent(MarkdownStub).props('view')).toEqual({ type: 'custom', component: 'notes.item-card', props: { payload: { id: 'n1' }, output: { title: 'Milk' } } });
    expect(wrapper.find('[data-test="call-card"]').exists()).toBe(false);
  });

  it('QA52-E11 a failed call keeps the call card', async () => {
    const wrapper = await mounted(MessageItem, createFakeKvman(), { message: result(true), calls: new Map() });
    expect(wrapper.find('[data-test="extension-card"]').exists()).toBe(false);
    expect(wrapper.find('[data-test="call-card"]').exists()).toBe(true);
  });
});
