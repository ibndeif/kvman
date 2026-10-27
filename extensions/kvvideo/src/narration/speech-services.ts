import { ProblemError } from '@kvman/sdk';
import { kvvideoProblem } from '../problems.ts';

// ElevenLabs and OpenAI (plan 16 §16.6): one request per narration, answered with MP3 audio. A request gets 60 s. The
// key goes only into its header; a failure's Problem carries the status and the start of the answer, never the key.

export type WebService = 'elevenlabs' | 'openai';

export type SpeechRequest = { url: string; headers: Record<string, string>; body: string };

export type Fetch = (url: string, init: { method: 'POST'; headers: Record<string, string>; body: string; signal: AbortSignal }) => Promise<Response>;

const defaults = {
  elevenlabs: { voice: 'JBFqnCBsd6RMkjVDRZzb', model: 'eleven_multilingual_v2' },
  openai: { voice: 'alloy', model: 'gpt-4o-mini-tts' },
} as const;

const requestTimeoutMs = 60_000;

export function speechRequest(service: WebService, text: string, choice: { voice: string | null; model: string | null }, key: string): SpeechRequest {
  const voice = choice.voice ?? defaults[service].voice;
  const model = choice.model ?? defaults[service].model;
  if (service === 'elevenlabs') {
    return {
      url: `https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voice)}?output_format=mp3_44100_128`,
      headers: { 'xi-api-key': key, 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, model_id: model }),
    };
  }
  return {
    url: 'https://api.openai.com/v1/audio/speech',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model, voice, input: text, response_format: 'mp3' }),
  };
}

function withoutKey(text: string, key: string): string {
  return key === '' ? text : text.split(key).join('…');
}

const reasonOf = (error: unknown): string => (error instanceof Error ? error.message : String(error));

/** The audio a service answers, or `kvvideo/NARRATION_FAILED`. */
export async function speak(service: WebService, request: SpeechRequest, key: string, fetch: Fetch, signal: AbortSignal): Promise<Buffer> {
  const timeout = new AbortController();
  const timer = setTimeout(() => timeout.abort(new Error(`no answer in ${String(requestTimeoutMs / 1000)} s`)), requestTimeoutMs);
  try {
    const response = await fetch(request.url, { method: 'POST', headers: request.headers, body: request.body, signal: AbortSignal.any([signal, timeout.signal]) });
    if (!response.ok) {
      const reason = withoutKey((await response.text()).slice(0, 300), key);
      throw kvvideoProblem('NARRATION_FAILED', `${service} answered ${String(response.status)}: ${reason}`, { service, status: response.status, reason });
    }
    return Buffer.from(await response.arrayBuffer());
  } catch (error) {
    if (signal.aborted || error instanceof ProblemError) throw error;
    const reason = withoutKey(timeout.signal.aborted ? reasonOf(timeout.signal.reason) : reasonOf(error), key);
    throw kvvideoProblem('NARRATION_FAILED', `${service} couldn't be reached: ${reason}`, { service, reason });
  } finally {
    clearTimeout(timer);
  }
}
