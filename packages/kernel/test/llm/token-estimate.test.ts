import { canonicalJson } from '@kvman/protocol';
import { describe, expect, it } from 'vitest';
import { estimateTokens } from '../../src/llm/token-estimate.ts';

describe('token estimate (ADR 0154)', () => {
  it('M2.9-E3 estimateTokens counts texts and canonical tool JSON, never images', () => {
    const tools = [{ name: 'lookup', description: 'Looks up.', input: { type: 'object' } }];
    const toolCalls = [{ id: 'c1', name: 'lookup', args: { q: 'hi' } }];
    const request = {
      purpose: 'chat' as const,
      system: 'be brief',
      messages: [
        { role: 'user' as const, content: 'hello' },
        {
          role: 'user' as const,
          content: [
            { type: 'text' as const, text: 'see this' },
            { type: 'image' as const, blobId: 'a'.repeat(64), mime: 'image/png' },
          ],
        },
        { role: 'assistant' as const, content: 'answer', thinking: 'hmm', toolCalls },
        { role: 'tool' as const, toolCallId: 'c1', content: 'result' },
      ],
      tools,
    };
    const characters = 'be brief'.length
      + 'hello'.length + 'see this'.length + 'answer'.length + 'hmm'.length + 'result'.length
      + canonicalJson(tools).length + canonicalJson(toolCalls).length;
    expect(estimateTokens(request)).toBe(Math.ceil(characters / 4));
    expect(estimateTokens({ purpose: 'chat', messages: [] })).toBe(0);
  });
});
