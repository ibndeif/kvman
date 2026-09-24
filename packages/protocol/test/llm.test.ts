import { describe, expect, it } from 'vitest';
import { llmRequestSchema, llmResultSchema, modelDefSchema, providerEntrySchema } from '../src/index.ts';
import { expectRoundTrip, issuePaths } from './assertions.ts';

const blobId = 'c'.repeat(64);

const request = {
  purpose: 'chat',
  model: { provider: 'anthropic', id: 'claude-sonnet-5' },
  system: 'You are a coding agent.',
  messages: [
    { role: 'user', content: [{ type: 'text', text: 'What is in this image?' }, { type: 'image', blobId, mime: 'image/png' }] },
    { role: 'assistant', content: '', thinking: 'Let me look.', toolCalls: [{ id: 'c1', name: 'fs_file_get', args: { path: 'a.txt' } }] },
    { role: 'tool', toolCallId: 'c1', content: 'hello', isError: false },
    { role: 'user', content: 'Thanks' },
  ],
  tools: [{ name: 'fs_file_get', description: 'Read a file.', input: { type: 'object' } }],
  thinking: 'medium',
  maxTokens: 4096,
  live: { text: 'agent.tokens.generated:s1', thinking: 'agent.thinking.generated:s1' },
};

const result = {
  content: 'Here it is.',
  thinking: 'Done.',
  toolCalls: [{ id: 'c2', name: 'shell_exec', args: { command: 'ls', title: 'List' } }],
  usage: { input: 1200, output: 80, cacheRead: 1000, cacheWrite: 0 },
  costUsd: 0.0042,
  model: { provider: 'anthropic', id: 'claude-sonnet-5' },
  stopReason: 'tool-calls',
};

const provider = {
  id: 'anthropic', title: 'Anthropic', description: 'Claude models through the Anthropic API.', auth: 'api-key',
  functions: ['provider:anthropic.complete', 'provider:anthropic.status', 'provider:anthropic.listModels'],
};

describe('LLM shapes (plan 05 §5.11, ADR 0014)', () => {
  it('M0.3-E17 requests and results round-trip', () => {
    expectRoundTrip(llmRequestSchema, request);
    expectRoundTrip(llmResultSchema, result);
  });

  it('M0.3-E18 malformed tools, arguments, live addresses, and thinking levels are rejected', () => {
    expect(issuePaths(llmRequestSchema, { ...request, tools: [{ name: 'x'.repeat(65), description: '', input: {} }] })).toEqual(['tools.0.name']);
    expect(issuePaths(llmRequestSchema, { ...request, tools: [{ name: 'fs.file.get', description: '', input: {} }] })).toEqual(['tools.0.name']);
    expect(issuePaths(llmResultSchema, { ...result, toolCalls: [{ id: 'c2', name: 'shell_exec', args: ['ls'] }] })).toEqual(['toolCalls.0.args']);
    expect(issuePaths(llmRequestSchema, { ...request, live: { text: 'agent.tokens.generated' } })).toEqual(['live.text']);
    expect(issuePaths(llmRequestSchema, { ...request, thinking: 'max' })).toEqual(['thinking']);
  });

  it('M0.3-E19 models may omit cost; providers register complete and status of their own', () => {
    const model = {
      provider: 'ollama', title: 'Llama 3.1', description: 'A local model.', contextWindow: 131072, maxOutput: 8192,
      capabilities: { tools: true, vision: false, thinking: [] },
    };
    expectRoundTrip(modelDefSchema, model);
    expectRoundTrip(providerEntrySchema, provider);
    expect(issuePaths(providerEntrySchema, { ...provider, functions: ['provider:anthropic.status'] })).toEqual(['functions']);
    expect(issuePaths(providerEntrySchema, { ...provider, functions: [...provider.functions, 'provider:openai.countTokens'] })).toEqual(['functions.3']);
  });
});
