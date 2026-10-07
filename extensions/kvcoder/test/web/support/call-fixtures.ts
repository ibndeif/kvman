import type { VueWrapper } from '@vue/test-utils';
import MessageItem from '../../../web/src/MessageItem.vue';
import { callViews } from '../../../web/src/message-parts.ts';
import { createFakeKvman, type FakeKvman } from './fake-kvman.ts';
import { message, mounted } from './fixtures.ts';

// A `run` call and its result as kvcoder stores them, mounted as the conversation shows them (ADR 0036).

type Json = Parameters<typeof message>[1][string];

export type Call = { description: string; connector: string; command: string; payload?: Record<string, Json> };

/** The card of a finished call: `output` is what the call returned, an object as its JSON on one line. */
export async function ranCard(call: Call, output: Json, options: { failed?: boolean; fake?: FakeKvman } = {}): Promise<VueWrapper> {
  const text = typeof output === 'string' ? output : JSON.stringify(output);
  const assistant = message('assistant', { role: 'assistant', content: [{ type: 'toolCall', id: 'c1', name: 'run', arguments: call }] });
  const result = message('toolResult', { role: 'toolResult', toolCallId: 'c1', toolName: 'run', content: [{ type: 'text', text }], isError: options.failed === true, details: { description: call.description, connector: call.connector, command: call.command, durationMs: 200 } });
  return mounted(MessageItem, options.fake ?? createFakeKvman(), { message: result, calls: callViews([assistant, result]) });
}

export const part = (wrapper: VueWrapper, name: string) => wrapper.find(`[data-test="${name}"]`);

export const parts = (wrapper: VueWrapper, name: string) => wrapper.findAll(`[data-test="${name}"]`);

/** A card's closed line: its words, subject, and outcome, or its `connector · command`. */
export function closedLine(wrapper: VueWrapper): string {
  const label = part(wrapper, 'call-label');
  if (label.exists()) return label.text();
  return ['call-words', 'call-subject', 'call-outcome'].flatMap((name) => (part(wrapper, name).exists() ? [part(wrapper, name).text()] : [])).join(' ');
}

export const isOpen = (wrapper: VueWrapper): boolean => wrapper.find('[data-test="call-card"] button').attributes('aria-expanded') === 'true';

export const pressed = (wrapper: VueWrapper) => wrapper.find('[data-test="call-card"] button').trigger('click');

/** The lines a block shows, each with its number or its diff mark before its text. */
export const shownLines = (wrapper: VueWrapper, block: string): string[] => wrapper.findAll(`[data-test="${block}"] [data-test="call-line-row"]`).map((row) => row.text());
