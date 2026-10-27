import { describe, expect, it } from 'vitest';
import { ProblemError } from '@kvman/sdk';
import { speak, speechRequest, type Fetch } from '../../src/narration/speech-services.ts';

type Sent = { url: string; method: string; headers: Record<string, string>; body: string };

function recording(answer: (sent: Sent, signal: AbortSignal) => Promise<Response>): { fetch: Fetch; sent: Sent[] } {
  const sent: Sent[] = [];
  return {
    sent,
    fetch: (url, init) => {
      const request = { url, method: init.method, headers: init.headers, body: init.body };
      sent.push(request);
      return answer(request, init.signal);
    },
  };
}

const audio = (): Promise<Response> => Promise.resolve(new Response(new Uint8Array([0x49, 0x44, 0x33]), { status: 200 }));
const problemOf = (run: Promise<unknown>): Promise<unknown> =>
  run.then(
    () => undefined,
    (error: unknown) => (error instanceof ProblemError ? error.problem : error),
  );
const signal = new AbortController().signal;

describe('the narration services (16 §16.6)', () => {
  it('M5.3-H1 ElevenLabs is asked with its address, key header, and body, with defaults and with settings', async () => {
    const { fetch, sent } = recording(audio);
    const request = speechRequest('elevenlabs', 'Welcome to Notes.', { voice: null, model: null }, 'el-key');
    expect([...(await speak('elevenlabs', request, 'el-key', fetch, signal))]).toEqual([0x49, 0x44, 0x33]);
    expect(sent).toEqual([
      { url: 'https://api.elevenlabs.io/v1/text-to-speech/JBFqnCBsd6RMkjVDRZzb?output_format=mp3_44100_128', method: 'POST', headers: { 'xi-api-key': 'el-key', 'Content-Type': 'application/json' }, body: JSON.stringify({ text: 'Welcome to Notes.', model_id: 'eleven_multilingual_v2' }) },
    ]);
    const chosen = speechRequest('elevenlabs', 'Hi.', { voice: 'abc', model: 'eleven_flash_v2_5' }, 'el-key');
    expect([chosen.url, JSON.parse(chosen.body)]).toEqual(['https://api.elevenlabs.io/v1/text-to-speech/abc?output_format=mp3_44100_128', { text: 'Hi.', model_id: 'eleven_flash_v2_5' }]);
  });

  it('M5.3-H2 OpenAI is asked with its address, bearer key, and body, with defaults and with settings', async () => {
    const { fetch, sent } = recording(audio);
    await speak('openai', speechRequest('openai', 'Welcome to Notes.', { voice: null, model: null }, 'oa-key'), 'oa-key', fetch, signal);
    expect(sent).toEqual([
      { url: 'https://api.openai.com/v1/audio/speech', method: 'POST', headers: { Authorization: 'Bearer oa-key', 'Content-Type': 'application/json' }, body: JSON.stringify({ model: 'gpt-4o-mini-tts', voice: 'alloy', input: 'Welcome to Notes.', response_format: 'mp3' }) },
    ]);
    expect(JSON.parse(speechRequest('openai', 'Hi.', { voice: 'nova', model: 'tts-1-hd' }, 'k').body)).toEqual({ model: 'tts-1-hd', voice: 'nova', input: 'Hi.', response_format: 'mp3' });
  });

  it('M5.3-E3 a refusal, a failed request, and no answer fail NARRATION_FAILED', async () => {
    const request = speechRequest('openai', 'Hi.', { voice: null, model: null }, 'oa-key');
    const refused = recording(async () => new Response('x'.repeat(400), { status: 401 }));
    expect(await problemOf(speak('openai', request, 'oa-key', refused.fetch, signal))).toEqual({ code: 'kvvideo/NARRATION_FAILED', message: `openai answered 401: ${'x'.repeat(300)}`, params: { service: 'openai', status: 401, reason: 'x'.repeat(300) } });
    const unreachable = recording(async () => Promise.reject(new TypeError('fetch failed')));
    expect(await problemOf(speak('openai', request, 'oa-key', unreachable.fetch, signal))).toMatchObject({ code: 'kvvideo/NARRATION_FAILED', params: { service: 'openai', reason: 'fetch failed' } });
  });

  it('M5.3-E3 a service that never answers fails after 60 s', async () => {
    const vitest = await import('vitest');
    vitest.vi.useFakeTimers();
    try {
      const silent = recording((_sent, aborted) => new Promise((_resolve, reject) => aborted.addEventListener('abort', () => reject(aborted.reason as Error))));
      const pending = problemOf(speak('elevenlabs', speechRequest('elevenlabs', 'Hi.', { voice: null, model: null }, 'k'), 'k', silent.fetch, signal));
      await vitest.vi.advanceTimersByTimeAsync(60_000);
      expect(await pending).toMatchObject({ code: 'kvvideo/NARRATION_FAILED', params: { service: 'elevenlabs', reason: 'no answer in 60 s' } });
    } finally {
      vitest.vi.useRealTimers();
    }
  });

  it('M5.3-E6 the key is never in a Problem or an answer', async () => {
    const key = 'el-secret-123';
    const echoing = recording(async (sent) => new Response(JSON.stringify(sent.headers), { status: 401 }));
    for (const service of ['elevenlabs', 'openai'] as const) {
      const problem = await problemOf(speak(service, speechRequest(service, 'Hi.', { voice: null, model: null }, key), key, echoing.fetch, signal));
      expect(JSON.stringify(problem)).not.toContain(key);
    }
    const failing = recording(async () => Promise.reject(new Error(`bad header ${key}`)));
    expect(JSON.stringify(await problemOf(speak('openai', speechRequest('openai', 'Hi.', { voice: null, model: null }, key), key, failing.fetch, signal)))).not.toContain(key);
  });
});
