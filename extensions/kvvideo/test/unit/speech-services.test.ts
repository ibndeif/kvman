import { describe, expect, it } from 'vitest';
import { ProblemError } from '@kvman/sdk';
import { speak, speechRequest, type Direction, type Fetch } from '../../src/narration/speech-services.ts';

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

const plain: Direction = { tone: null, speed: 1, previous: null, next: null };
const defaults = { voice: null, model: null };
const mp3 = (): Promise<Response> => Promise.resolve(new Response(new Uint8Array([0x49, 0x44, 0x33]), { status: 200 }));

// ElevenLabs's answer for `text`: three bytes of audio, and each character 100 ms long.
function elevenLabsAnswer(text: string, alignment: Record<string, unknown> | null = null): Promise<Response> {
  const characters = [...text];
  const times = alignment ?? { characters, character_start_times_seconds: characters.map((_, index) => index / 10), character_end_times_seconds: characters.map((_, index) => index / 10 + 0.09) };
  return Promise.resolve(Response.json({ audio_base64: Buffer.from([0x49, 0x44, 0x33]).toString('base64'), alignment: times }));
}

const problemOf = (run: Promise<unknown>): Promise<unknown> =>
  run.then(
    () => undefined,
    (error: unknown) => (error instanceof ProblemError ? error.problem : error),
  );
const signal = new AbortController().signal;

describe('the narration services (16 §16.6, ADR 0115, 15, 17, and 39)', () => {
  it('M5.3-H1 M5.6-H3 ElevenLabs is asked for timestamps with its key, neighbours, and speed', async () => {
    const { fetch, sent } = recording(() => elevenLabsAnswer('Welcome to Notes.'));
    const request = speechRequest('elevenlabs', 'Welcome to Notes.', defaults, 'el-key', { ...plain, previous: 'Hello.', next: 'Sign in.' });
    await speak('elevenlabs', request, 'Welcome to Notes.', 'el-key', fetch, signal);
    expect(sent).toEqual([
      {
        url: 'https://api.elevenlabs.io/v1/text-to-speech/JBFqnCBsd6RMkjVDRZzb/with-timestamps?output_format=mp3_44100_128',
        method: 'POST',
        headers: { 'xi-api-key': 'el-key', 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: 'Welcome to Notes.', model_id: 'eleven_multilingual_v2', previous_text: 'Hello.', next_text: 'Sign in.' }),
      },
    ]);
    const first = speechRequest('elevenlabs', 'Hi.', { voice: 'abc', model: 'eleven_flash_v2_5' }, 'k', { ...plain, speed: 0.9, next: 'Then.', tone: 'warm' });
    expect([first.url, JSON.parse(first.body)]).toEqual(['https://api.elevenlabs.io/v1/text-to-speech/abc/with-timestamps?output_format=mp3_44100_128', { text: 'Hi.', model_id: 'eleven_flash_v2_5', next_text: 'Then.', voice_settings: { speed: 0.9 } }]);
  });

  it('M5.6-H4 ElevenLabs answers the audio and each character in whole milliseconds', async () => {
    const { fetch } = recording(() => elevenLabsAnswer('Hi there.'));
    const speech = await speak('elevenlabs', speechRequest('elevenlabs', 'Hi there.', defaults, 'k', plain), 'Hi there.', 'k', fetch, signal);
    expect([...speech.audio]).toEqual([0x49, 0x44, 0x33]);
    expect(speech.alignment?.startsMs).toEqual([0, 100, 200, 300, 400, 500, 600, 700, 800]);
    expect(speech.alignment?.endsMs[8]).toBe(890);
  });

  it('M5.6-E3 ElevenLabs without character times gives the audio alone', async () => {
    const { fetch } = recording(() => Promise.resolve(Response.json({ audio_base64: Buffer.from([1]).toString('base64'), alignment: null })));
    expect(await speak('elevenlabs', speechRequest('elevenlabs', 'Hi.', defaults, 'k', plain), 'Hi.', 'k', fetch, signal)).toEqual({ audio: Buffer.from([1]), alignment: null });
  });

  it("M5.6-E2 character times that aren't the text, or an answer without audio, fail NARRATION_FAILED", async () => {
    const request = speechRequest('elevenlabs', 'Hi.', defaults, 'k', plain);
    const answers = [
      () => elevenLabsAnswer('Hi.', { characters: ['H', 'o', '.'], character_start_times_seconds: [0, 0.1, 0.2], character_end_times_seconds: [0.1, 0.2, 0.3] }),
      () => elevenLabsAnswer('Hi.', { characters: ['H', 'i', '.'], character_start_times_seconds: [0, 0.1], character_end_times_seconds: [0.1, 0.2, 0.3] }),
      () => Promise.resolve(Response.json({ alignment: null })),
    ];
    for (const answer of answers) expect(await problemOf(speak('elevenlabs', request, 'Hi.', 'k', recording(answer).fetch, signal))).toMatchObject({ code: 'kvvideo/NARRATION_FAILED', params: { service: 'elevenlabs' } });
  });

  it('M5.3-H2 M5.6-H5 OpenAI is asked with its bearer key, and with the tone and speed when given', async () => {
    const { fetch, sent } = recording(mp3);
    const speech = await speak('openai', speechRequest('openai', 'Welcome to Notes.', defaults, 'oa-key', plain), 'Welcome to Notes.', 'oa-key', fetch, signal);
    expect(speech).toEqual({ audio: Buffer.from([0x49, 0x44, 0x33]), alignment: null });
    expect(sent).toEqual([
      { url: 'https://api.openai.com/v1/audio/speech', method: 'POST', headers: { Authorization: 'Bearer oa-key', 'Content-Type': 'application/json' }, body: JSON.stringify({ model: 'gpt-4o-mini-tts', voice: 'alloy', input: 'Welcome to Notes.', response_format: 'mp3' }) },
    ]);
    const directed = speechRequest('openai', 'Hi.', { voice: 'nova', model: 'tts-1-hd' }, 'k', { ...plain, tone: 'warm and upbeat', speed: 1.1, previous: 'Ignored.' });
    expect(JSON.parse(directed.body)).toEqual({ model: 'tts-1-hd', voice: 'nova', input: 'Hi.', response_format: 'mp3', instructions: 'warm and upbeat', speed: 1.1 });
  });

  it('M5.3-E3 a refusal, a failed request, and no answer fail NARRATION_FAILED', async () => {
    const request = speechRequest('openai', 'Hi.', defaults, 'oa-key', plain);
    const refused = recording(async () => new Response('x'.repeat(400), { status: 401 }));
    expect(await problemOf(speak('openai', request, 'Hi.', 'oa-key', refused.fetch, signal))).toEqual({ code: 'kvvideo/NARRATION_FAILED', message: `openai answered 401: ${'x'.repeat(300)}`, params: { service: 'openai', status: 401, reason: 'x'.repeat(300) } });
    const unreachable = recording(async () => Promise.reject(new TypeError('fetch failed')));
    expect(await problemOf(speak('openai', request, 'Hi.', 'oa-key', unreachable.fetch, signal))).toMatchObject({ code: 'kvvideo/NARRATION_FAILED', params: { service: 'openai', reason: 'fetch failed' } });
  });

  it('M5.3-E3 a service that never answers fails after 60 s', async () => {
    const vitest = await import('vitest');
    vitest.vi.useFakeTimers();
    try {
      const silent = recording((_sent, aborted) => new Promise((_resolve, reject) => aborted.addEventListener('abort', () => reject(aborted.reason as Error))));
      const pending = problemOf(speak('elevenlabs', speechRequest('elevenlabs', 'Hi.', defaults, 'k', plain), 'Hi.', 'k', silent.fetch, signal));
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
      const problem = await problemOf(speak(service, speechRequest(service, 'Hi.', defaults, key, plain), 'Hi.', key, echoing.fetch, signal));
      expect(JSON.stringify(problem)).not.toContain(key);
    }
    const failing = recording(async () => Promise.reject(new Error(`bad header ${key}`)));
    expect(JSON.stringify(await problemOf(speak('openai', speechRequest('openai', 'Hi.', defaults, key, plain), 'Hi.', key, failing.fetch, signal)))).not.toContain(key);
  });
});
