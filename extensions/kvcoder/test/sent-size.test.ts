import { describe, expect, it } from 'vitest';
import { sentCharacters } from '../src/turns/sent-size.ts';

describe("what is sent of a message, for compaction's count (08 §8.1, ADR 0033, 6)", () => {
  it('QA45-E3 text, thinking, and calls count; details, signatures, and metadata do not', () => {
    const toolResult = { content: { role: 'toolResult', toolCallId: 'call-1', toolName: 'run', content: [{ type: 'text', text: 'twelve chars' }], isError: false, timestamp: 1, details: { output: 'x'.repeat(5000) } } };
    expect(sentCharacters(toolResult)).toBe(12);
    const assistant = {
      content: {
        role: 'assistant',
        model: 'm1',
        usage: { input: 9, output: 9 },
        content: [
          { type: 'thinking', thinking: 'hmm', thinkingSignature: 'x'.repeat(3000) },
          { type: 'text', text: 'hello', textSignature: 'x'.repeat(100) },
          { type: 'toolCall', id: 'call-1', name: 'run', arguments: { connector: 'fs' } },
        ],
      },
    };
    expect(sentCharacters(assistant)).toBe('hmm'.length + 'hello'.length + 'run'.length + '{"connector":"fs"}'.length);
    expect(sentCharacters({ content: { role: 'user', content: 'four', timestamp: 1 } })).toBe(4);
    expect(sentCharacters({ content: { code: 'CANCELLED', params: {} } })).toBe(0);
  });
});
