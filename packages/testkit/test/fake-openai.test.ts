import { afterEach, describe, expect, it } from 'vitest';
import { startFakeOpenAI, type FakeOpenAI } from '../src/fake-openai.ts';

const started: FakeOpenAI[] = [];

afterEach(async () => {
  for (const fake of started.splice(0)) await fake.close();
});

async function start(): Promise<FakeOpenAI> {
  const fake = await startFakeOpenAI();
  started.push(fake);
  return fake;
}

function post(fake: FakeOpenAI, body: unknown, route = '/chat/completions'): Promise<Response> {
  return fetch(`${fake.baseUrl}${route}`, { method: 'POST', headers: { 'content-type': 'application/json', authorization: 'Bearer sk-test' }, body: JSON.stringify(body) });
}

// The JSON of each `data:` event of a server-sent event stream, up to `[DONE]`.
function events(text: string): unknown[] {
  return text
    .split('\n\n')
    .map((block) => block.replace(/^data: /, ''))
    .filter((data) => data !== '' && data !== '[DONE]')
    .map((data): unknown => JSON.parse(data));
}

describe('the fake OpenAI server (plan 07 §7.4, ADR 0009, 62)', () => {
  it('M2.1-H9 answers queued replies in order, records requests, and fails a request with no reply', async () => {
    const fake = await start();
    expect(fake.baseUrl).toMatch(/^http:\/\/127\.0\.0\.1:\d+\/v1$/);
    fake.reply(
      { chunks: [{ thinking: 'hmm' }, { text: 'Hi' }, { toolCall: { id: 'c1', name: 'bash', arguments: { command: 'ls' } } }], usage: { input: 3, output: 2, cacheRead: 1 } },
      { status: 429, body: { error: { message: 'Slow down.' } } },
    );
    const streamed = await post(fake, { model: 'm1', messages: [] });
    expect(streamed.headers.get('content-type')).toBe('text/event-stream');
    const deltas = events(await streamed.text());
    expect(deltas).toEqual([
      expect.objectContaining({ choices: [{ index: 0, delta: { role: 'assistant', content: '' }, finish_reason: null }] }),
      expect.objectContaining({ choices: [{ index: 0, delta: { reasoning_content: 'hmm' }, finish_reason: null }] }),
      expect.objectContaining({ choices: [{ index: 0, delta: { content: 'Hi' }, finish_reason: null }] }),
      expect.objectContaining({
        choices: [{ index: 0, delta: { tool_calls: [{ index: 0, id: 'c1', type: 'function', function: { name: 'bash', arguments: '{"command":"ls"}' } }] }, finish_reason: null }],
      }),
      expect.objectContaining({ choices: [{ index: 0, delta: {}, finish_reason: 'tool_calls' }] }),
      expect.objectContaining({ choices: [], usage: { prompt_tokens: 4, completion_tokens: 2, total_tokens: 6, prompt_tokens_details: { cached_tokens: 1, cache_write_tokens: 0 } } }),
    ]);
    const limited = await post(fake, { model: 'm1', messages: ['again'] });
    expect([limited.status, await limited.json()]).toEqual([429, { error: { message: 'Slow down.' } }]);
    const unscripted = await post(fake, { model: 'm1' });
    expect(unscripted.status).toBe(500);
    expect(await unscripted.text()).toContain('no reply queued');
    expect((await post(fake, {}, '/models')).status).toBe(404);
    expect(fake.requests()).toEqual([
      { authorization: 'Bearer sk-test', body: { model: 'm1', messages: [] }, state: 'answered' },
      { authorization: 'Bearer sk-test', body: { model: 'm1', messages: ['again'] }, state: 'answered' },
      { authorization: 'Bearer sk-test', body: { model: 'm1' }, state: 'answered' },
    ]);
  });
});
