import { describe, expect, it } from 'vitest';
import type { Message } from '../../src/index.ts';
import ConversationView from '../../web/src/ConversationView.vue';
import { createFakeKvman } from './support/fake-kvman.ts';
import { answer, message, mounted, serve, session, turn, user } from './support/fixtures.ts';

// The agent's housekeeping calls show no card and count in no fold (08 §8.7, ADR 0108, 13).
let ids = 0;
function called(connector: string, command: string, payload: Message['content'], text: string, isError = false): Message[] {
  ids += 1;
  const id = `h${ids}`;
  return [
    message('assistant', { role: 'assistant', content: [{ type: 'toolCall', id, name: 'run', arguments: { connector, command, payload } }] }, { turnId: 't1', durationMs: 1000 }),
    message('toolResult', { role: 'toolResult', toolCallId: id, toolName: 'run', content: [{ type: 'text', text }], isError, details: { connector, command, durationMs: 500 } }, { turnId: 't1' }),
  ];
}
const read = (path: string) => called('fs', 'read', { path }, JSON.stringify({ path, fromLine: 1, totalLines: 1, content: 'a\n' }));

async function shown(messages: Message[]) {
  const fake = createFakeKvman();
  serve(fake, { found: session({ status: 'idle' }), messages, omitted: 0, turns: [turn({ outcome: 'done', endedAt: '2026-10-01T09:01:00.000Z' })] });
  return mounted(ConversationView, fake, { sessionId: 's1' });
}

describe('housekeeping calls (ADR 0108, 13)', () => {
  it('QA71-H25 help, mcp tools, background wait, and execution-map update show nothing, and a fold counts only the read', async () => {
    const view = await shown([
      user('go', { turnId: 't1' }),
      ...read('a.ts'),
      ...called('fs', 'help', { command: 'read' }, 'fs read: …'),
      ...called('mcp', 'tools', { server: 'playwright' }, '{"server":"playwright","tools":[]}'),
      ...called('background', 'wait', { id: 'j1' }, '{"id":"j1","status":"succeeded"}'),
      ...called('execution-map', 'update', { steps: [{ id: 'a', status: 'doing' }] }, '{"goal":"g"}'),
      ...read('b.ts'),
      answer('Done.', { turnId: 't1' }),
    ]);
    expect(view.findAll('[data-test="call-fold"]')).toHaveLength(1);
    expect(view.find('[data-test="call-fold-words"]').text()).toBe('Read 2 files');
    await view.find('[data-test="call-fold-head"]').trigger('click');
    expect(view.findAll('[data-test="call-fold-body"] [data-test="call-card"]')).toHaveLength(2);
  });

  it('QA71-E35 a failed housekeeping call is hidden too, and a fold counts no failure for it', async () => {
    const view = await shown([
      user('go', { turnId: 't1' }),
      ...read('a.ts'),
      ...called('background', 'wait', { id: 'gone' }, 'error kvcoder/JOB_NOT_FOUND: no such run', true),
      ...called('shell', 'help', {}, 'error NOT_FOUND: …', true),
      ...read('b.ts'),
      answer('Done.', { turnId: 't1' }),
    ]);
    expect(view.find('[data-test="call-fold-words"]').text()).toBe('Read 2 files');
    expect(view.find('[data-test="call-fold-failed"]').exists()).toBe(false);
    expect(view.findAll('.kvc-column > [data-test="call-card"]')).toHaveLength(0);
  });
});
