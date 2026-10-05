import { describe, expect, it } from 'vitest';
import MessageItem from '../../web/src/MessageItem.vue';
import QuestionCard from '../../web/src/QuestionCard.vue';
import { callViews } from '../../web/src/message-parts.ts';
import { createFakeKvman } from './support/fake-kvman.ts';
import { message, mounted } from './support/fixtures.ts';

type Json = Parameters<typeof message>[1][string];

// An `ask` call and its result, as kvcoder stores them: the call holds the question, and the result's text is the answer.
async function answered(command: string, payload: Record<string, Json>, text: string, isError = false) {
  const call = message('assistant', { role: 'assistant', content: [{ type: 'toolCall', id: 'c1', name: 'run', arguments: { description: 'Asking about the scope.', connector: 'ask', command, payload } }] });
  const result = message('toolResult', { role: 'toolResult', toolCallId: 'c1', toolName: 'run', content: [{ type: 'text', text }], isError });
  return mounted(MessageItem, createFakeKvman(), { message: result, calls: callViews([call, result]) });
}

const choice = { prompt: 'Which features?', multiple: true, other: true, options: [{ id: 'core', label: 'Basics', description: 'Add and delete.' }, { id: 'search', label: 'Search' }, { id: 'drag', label: 'Drag and drop' }] };
const json = (value: Json): string => JSON.stringify(value, null, 2);

describe('an answered question shows its answer, not its JSON (08 §8.7, ADR 0013, 1)', () => {
  it('QA20-H1 an answered choice shows the question and every option, with the chosen ones and the other answer marked', async () => {
    const card = await answered('choice', choice, json({ selected: ['drag', 'core'], other: 'Dark mode too' }));
    expect(card.find('[data-test="call-card"]').exists()).toBe(false);
    expect(card.find('[data-test="answered-prompt"]').text()).toBe('Which features?');
    const options = card.findAll('[data-test^="answered-option-"]');
    expect(options.map((option) => [option.attributes('data-test'), option.attributes('data-chosen')])).toEqual([['answered-option-core', 'true'], ['answered-option-search', 'false'], ['answered-option-drag', 'true']]);
    expect(options[0]?.text()).toContain('Add and delete.');
    expect(card.find('[data-test="answered-other"]').text()).toContain('Dark mode too');
    expect(card.html()).not.toContain('"selected"');
  });

  it('QA20-H2 an answered text question shows the text, and an answered confirm shows Yes or No', async () => {
    const text = await answered('text', { prompt: 'Name?' }, json({ text: 'Ada\nLovelace' }));
    expect(text.find('[data-test="answered-prompt"]').text()).toBe('Name?');
    expect(text.find('[data-test="answered-text"]').text()).toBe('Ada\nLovelace');
    const yes = await answered('confirm', { prompt: 'Go on?' }, json({ confirmed: true }));
    expect(yes.find('[data-test="answered-confirmed"]').text()).toBe('Yes');
    const no = await answered('confirm', { prompt: 'Delete it?', danger: true }, json({ confirmed: false }));
    expect(no.find('[data-test="answered-confirmed"]').text()).toBe('No');
  });

  it('QA20-E1 a skipped question, and one a message dismissed, show Skipped under the question', async () => {
    for (const text of [json({ dismissed: true }), 'dismissed by the user']) {
      const card = await answered('choice', choice, text);
      expect(card.find('[data-test="answered-prompt"]').text()).toBe('Which features?');
      expect(card.find('[data-test="answered-skipped"]').text()).toBe('Skipped');
      expect(card.findAll('[data-test^="answered-option-"]')).toEqual([]);
    }
  });

  it('QA20-E2 a failed ask call, an ask help call, and a result that is not JSON keep the call card', async () => {
    const failed = await answered('choice', { question: 'Which?' }, 'VALIDATION_FAILED: The payload of ask choice is\n{ prompt, multiple, options }', true);
    expect(failed.find('[data-test="call-card"]').classes()).toContain('kvc-failed');
    expect(failed.find('[data-test="answered-card"]').exists()).toBe(false);
    const help = await answered('help', {}, 'ask: Put a question to the person.');
    expect(help.find('[data-test="call-card"]').exists()).toBe(true);
    const odd = await answered('text', { prompt: 'Name?' }, 'not json');
    expect(odd.find('[data-test="call-card"]').exists()).toBe(true);
  });

  it('QA20-H3 Enter in a text question sends the answer', async () => {
    const card = await mounted(QuestionCard, createFakeKvman(), { questionId: 'q1', question: { kind: 'text', prompt: 'Name?' } });
    await card.find('[data-test="answer-text"]').setValue('Ada');
    await card.find('[data-test="answer-text"]').trigger('keydown', { key: 'Enter' });
    expect(card.emitted('answer')).toEqual([[{ questionId: 'q1', answer: { text: 'Ada' } }]]);
  });

  it("QA20-E12 a person's message takes its direction from its own text", async () => {
    const bubble = await mounted(MessageItem, createFakeKvman(), { message: message('user', { role: 'user', content: 'ابنِ تطبيق مهام', timestamp: 1 }), calls: new Map() });
    expect(bubble.find('[data-test="user-message"]').attributes('dir')).toBe('auto');
  });
});
