import type { Stored } from '@kvman/sdk';
import { describe, expect, it } from 'vitest';
import type { MessageDoc } from '../src/schemas/records.ts';
import { collapsedView } from '../src/turns/collapse.ts';

// The artifacts a collapsed turn names (plan 08 §8.1, ADR 0123, 2).

let seq = 0;
function message(kind: MessageDoc['kind'], turnId: string | null, content: MessageDoc['content'], source: MessageDoc['source'] = null): Stored<MessageDoc> {
  seq += 1;
  return { id: `m${String(seq)}`, sessionId: 's', turnId, seq, block: 0, kind, source, content, fileIds: null, fileNames: null, model: null, usage: null, basis: null, sent: null, durationMs: null, createdAt: '2026-11-09T00:00:00.000Z' };
}

const person = (text: string) => message('user', null, { role: 'user', content: text }, { kind: 'user' });

const call = (id: string, command: string) => ({ type: 'toolCall', id, name: 'run', arguments: { connector: 'artifact', command, payload: {} } });

const reply = (turnId: string, text: string, toolCall?: ReturnType<typeof call>) =>
  message('assistant', turnId, { role: 'assistant', content: [...(text === '' ? [] : [{ type: 'text', text }]), ...(toolCall === undefined ? [] : [toolCall])] });

const artifactResult = (turnId: string, toolCallId: string, command: string, id: string, title: string, isError = false) =>
  message('toolResult', turnId, { role: 'toolResult', toolCallId, toolName: 'run', content: [{ type: 'text', text: isError ? 'error NOT_FOUND: The artifact is gone.' : '{}' }], isError, details: { connector: 'artifact', command, artifact: { id, title, format: 'markdown', version: 1 } } });

function answerOf(view: readonly Stored<MessageDoc>[], turnId: string): string {
  const last = view.findLast((shown) => shown.kind === 'assistant' && shown.turnId === turnId);
  const content = last?.content['content'];
  if (!Array.isArray(content)) return '';
  return content.flatMap((block) => (typeof block === 'object' && block !== null && !Array.isArray(block) && typeof block['text'] === 'string' ? [block['text']] : [])).join('\n');
}

describe('the artifacts a collapsed turn names (ADR 0123, 2)', () => {
  it('QA80-H2 a collapsed turn names its artifacts', () => {
    const write = call('c1', 'write');
    const edit = call('c2', 'edit');
    const messages = [
      person('go'),
      reply('t1', 'Writing.', write),
      artifactResult('t1', 'c1', 'write', 'report', 'Report'),
      reply('t1', 'Editing.', edit),
      artifactResult('t1', 'c2', 'edit', 'design', 'Design'),
      reply('t1', 'Done.'),
      person('next'),
    ];
    const view = collapsedView(messages, messages[5]?.seq ?? 0, new Map([['t1', ['notes.txt']]]));
    expect(answerOf(view, 't1')).toBe('Done.\n\n[kvman: files changed in this turn: notes.txt]\n\n[kvman: artifacts changed in this turn: design (Design), report (Report)]');
  });

  it("QA80-E5 a failed artifact call isn't named", () => {
    const edit = call('c1', 'edit');
    const messages = [person('go'), reply('t1', 'Editing.', edit), artifactResult('t1', 'c1', 'edit', 'report', 'Report', true), reply('t1', 'Done.')];
    const view = collapsedView(messages, messages[3]?.seq ?? 0, new Map());
    expect(answerOf(view, 't1')).toBe('Done.');
  });

  it('QA80-E6 one entry per id, with its last title', () => {
    const first = call('c1', 'write');
    const second = call('c2', 'write');
    const messages = [
      person('go'),
      reply('t1', 'Writing.', first),
      artifactResult('t1', 'c1', 'write', 'report', 'Draft'),
      reply('t1', 'Writing again.', second),
      artifactResult('t1', 'c2', 'write', 'report', 'Report'),
      reply('t1', 'Done.'),
    ];
    const view = collapsedView(messages, messages[5]?.seq ?? 0, new Map());
    expect(answerOf(view, 't1')).toBe('Done.\n\n[kvman: artifacts changed in this turn: report (Report)]');
  });

  it("QA80-E7 the line doesn't change later", () => {
    const write = call('c1', 'write');
    const laterWrite = call('c2', 'write');
    const laterDelete = call('c3', 'delete');
    const messages = [person('go'), reply('t1', 'Writing.', write), artifactResult('t1', 'c1', 'write', 'report', 'Report'), reply('t1', 'Done.')];
    const first = collapsedView(messages, messages[3]?.seq ?? 0, new Map());
    messages.push(person('later'), reply('t2', 'Renaming.', laterWrite), artifactResult('t2', 'c2', 'write', 'report', 'Renamed'), reply('t2', 'Deleting.', laterDelete), artifactResult('t2', 'c3', 'delete', 'report', 'Renamed'), reply('t2', 'Later done.'));
    const second = collapsedView(messages, messages[3]?.seq ?? 0, new Map());
    expect(answerOf(first, 't1')).toBe('Done.\n\n[kvman: artifacts changed in this turn: report (Report)]');
    expect(answerOf(second, 't1')).toBe(answerOf(first, 't1'));
  });

  it('QA80-E8 only collapsed turns get the line', () => {
    const write = call('c1', 'write');
    const laterWrite = call('c2', 'write');
    const messages = [person('go'), reply('t1', 'Writing.', write), artifactResult('t1', 'c1', 'write', 'report', 'Report'), reply('t1', 'Done.'), person('next')];
    const laterCall = reply('t2', 'Writing later.', laterWrite);
    const laterResult = artifactResult('t2', 'c2', 'write', 'later', 'Later');
    const laterAnswer = reply('t2', 'Later done.');
    messages.push(laterCall, laterResult, laterAnswer);
    const view = collapsedView(messages, messages[3]?.seq ?? 0, new Map());
    expect(view).toContain(laterCall);
    expect(view).toContain(laterResult);
    expect(answerOf(view, 't2')).toBe('Later done.');
  });

  it("QA80-E9 other calls don't count", () => {
    const get = call('c1', 'get');
    const remove = call('c2', 'delete');
    const messages = [
      person('go'),
      reply('t1', 'Reading.', get),
      artifactResult('t1', 'c1', 'get', 'report', 'Report'),
      reply('t1', 'Deleting.', remove),
      artifactResult('t1', 'c2', 'delete', 'report', 'Report'),
      reply('t1', 'Done.'),
    ];
    const view = collapsedView(messages, messages[5]?.seq ?? 0, new Map());
    expect(answerOf(view, 't1')).toBe('Done.');
  });
});
