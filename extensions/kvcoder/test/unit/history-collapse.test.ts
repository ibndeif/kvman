import type { Stored } from '@kvman/sdk';
import { describe, expect, it } from 'vitest';
import { clearable } from '../../src/turns/clear-results.ts';
import { collapsedView, collapsibleTurns } from '../../src/turns/collapse.ts';
import type { MessageDoc } from '../../src/schemas/records.ts';

// The rules of a collapsed history (plan 08 §8.1, ADR 0108, 5 and 7).

let seq = 0;
function message(kind: MessageDoc['kind'], turnId: string | null, content: MessageDoc['content'], source: MessageDoc['source'] = null): Stored<MessageDoc> {
  seq += 1;
  return { id: `m${String(seq)}`, sessionId: 's', turnId, seq, block: 0, kind, source, content, fileIds: null, fileNames: null, model: null, usage: null, basis: null, sent: null, durationMs: null, createdAt: '2026-10-29T00:00:00.000Z' };
}
const person = (text: string) => message('user', null, { role: 'user', content: text }, { kind: 'user' });
const reply = (turnId: string, text: string, call?: { id: string; connector: string; command: string }) => message('assistant', turnId, { role: 'assistant', content: [{ type: 'thinking', thinking: 'hmm' }, ...(text === '' ? [] : [{ type: 'text', text }]), ...(call === undefined ? [] : [{ type: 'toolCall', id: call.id, name: 'run', arguments: { connector: call.connector, command: call.command, payload: {} } }])] });
const result = (turnId: string, id: string, text: string) => message('toolResult', turnId, { role: 'toolResult', toolCallId: id, toolName: 'run', content: [{ type: 'text', text }], isError: false });
const turn = (id: string, outcome: 'done' | 'failed' | 'cancelled' | null, minute: number) => ({ id, outcome, startedAt: `2026-10-29T00:${String(minute).padStart(2, '0')}:00.000Z` });

describe('collapsing finished turns (ADR 0108, 5)', () => {
  it('QA71-H13 a collapsed turn is the person\'s message and its final answer, with no thinking, calls, results, or background messages', () => {
    const messages = [person('go'), reply('t1', 'Reading.', { id: 'c1', connector: 'fs', command: 'read' }), result('t1', 'c1', 'x'.repeat(400)), message('user', null, { role: 'user', content: 'The background call `x` finished' }, { kind: 'job', jobId: 'j' }), reply('t1', 'All done.'), person('next')];
    const view = collapsedView(messages, messages[4]?.seq ?? 0, new Map([['t1', ['a.ts', 'b.ts']]]));
    expect(view.map((shown) => shown.kind)).toEqual(['user', 'assistant', 'user']);
    expect(view[1]?.content['content']).toEqual([{ type: 'text', text: 'All done.\n\n[kvman: files changed in this turn: a.ts, b.ts]' }]);
    expect(view[2]).toBe(messages[5]);
  });

  it('QA71-H20 an mcp tools lookup stays whole in a collapsed turn and is never cleared', () => {
    const messages = [person('go'), reply('t1', '', { id: 'm1', connector: 'mcp', command: 'tools' }), result('t1', 'm1', 'tools list'), reply('t1', 'Done.')];
    const view = collapsedView(messages, messages[3]?.seq ?? 0, new Map());
    expect(view.map((shown) => shown.kind)).toEqual(['user', 'assistant', 'toolResult', 'assistant']);
    expect(view[1]?.content['content']).toEqual([{ type: 'toolCall', id: 'm1', name: 'run', arguments: { connector: 'mcp', command: 'tools', payload: {} } }]);
    const old = [person('go'), reply('t1', '', { id: 'm2', connector: 'mcp', command: 'tools' }), result('t1', 'm2', 'y'.repeat(200_000)), reply('t1', '', { id: 'r1', connector: 'fs', command: 'read' }), result('t1', 'r1', 'z'.repeat(200_000))];
    expect(clearable({ summary: undefined, messages: old, cleared: -1 })).toBeUndefined();
  });

  it('QA71-E12 a Continue chain stays whole: only turns up to the newest done one collapse, never the newest ended one', () => {
    expect(collapsibleTurns([turn('a', 'done', 1), turn('b', 'failed', 2), turn('c', 'cancelled', 3), turn('d', null, 4)])).toEqual(['a']);
    expect(collapsibleTurns([turn('a', 'done', 1), turn('b', 'done', 2), turn('c', 'done', 3), turn('d', null, 4)])).toEqual(['a', 'b']);
    expect(collapsibleTurns([turn('a', 'failed', 1), turn('b', 'done', 2)])).toEqual(['a']);
  });

  it('QA71-E13 with one ended turn nothing collapses', () => {
    expect(collapsibleTurns([turn('a', 'done', 1), turn('b', null, 2)])).toEqual([]);
    expect(collapsibleTurns([])).toEqual([]);
  });
});
