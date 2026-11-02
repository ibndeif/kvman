import { ProblemError, z } from '@kvman/sdk';
import { kvvideoProblem } from '../problems.ts';
import { alignmentOf, elevenLabsAlignmentSchema, type Alignment } from './alignment.ts';

// ElevenLabs and OpenAI (plan 16 §16.6; ADR 0115, 15, 17, and 39): one request per sentence. ElevenLabs answers its
// audio with each character's times, and is given the sentences around it so they sound like one take; OpenAI answers
// MP3 audio and takes the tone as its instructions. A request gets 60 s. The key goes only into its header; a
// failure's Problem carries the status and the start of the answer, never the key.

export type WebService = 'elevenlabs' | 'openai';

export type SpeechRequest = { url: string; headers: Record<string, string>; body: string };

/** How a sentence is said: the tone (OpenAI only), the speed, and its neighbours (ElevenLabs only). */
export type Direction = { tone: string | null; speed: number; previous: string | null; next: string | null };

export type Speech = { audio: Buffer; alignment: Alignment | null };

export type Fetch = (url: string, init: { method: 'POST'; headers: Record<string, string>; body: string; signal: AbortSignal }) => Promise<Response>;

const defaults = {
  elevenlabs: { voice: 'JBFqnCBsd6RMkjVDRZzb', model: 'eleven_multilingual_v2' },
  openai: { voice: 'alloy', model: 'gpt-4o-mini-tts' },
} as const;

const requestTimeoutMs = 60_000;

/** The voice and model a service uses: the chosen ones, else its defaults. */
export function resolvedChoice(service: WebService, choice: { voice: string | null; model: string | null }): { voice: string; model: string } {
  return { voice: choice.voice ?? defaults[service].voice, model: choice.model ?? defaults[service].model };
}

export function speechRequest(service: WebService, text: string, choice: { voice: string | null; model: string | null }, key: string, direction: Direction): SpeechRequest {
  const { voice, model } = resolvedChoice(service, choice);
  const speed = direction.speed === 1 ? {} : { speed: direction.speed };
  if (service === 'elevenlabs') {
    const neighbours = { ...(direction.previous === null ? {} : { previous_text: direction.previous }), ...(direction.next === null ? {} : { next_text: direction.next }) };
    return {
      url: `https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voice)}/with-timestamps?output_format=mp3_44100_128`,
      headers: { 'xi-api-key': key, 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, model_id: model, ...neighbours, ...(direction.speed === 1 ? {} : { voice_settings: speed }) }),
    };
  }
  return {
    url: 'https://api.openai.com/v1/audio/speech',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model, voice, input: text, response_format: 'mp3', ...(direction.tone === null ? {} : { instructions: direction.tone }), ...speed }),
  };
}

const elevenLabsAnswerSchema = z.object({ audio_base64: z.string(), alignment: elevenLabsAlignmentSchema.nullable() });

function withoutKey(text: string, key: string): string {
  return key === '' ? text : text.split(key).join('…');
}

const reasonOf = (error: unknown): string => (error instanceof Error ? error.message : String(error));

async function speechOf(service: WebService, response: Response, spoken: string): Promise<Speech> {
  if (service === 'openai') return { audio: Buffer.from(await response.arrayBuffer()), alignment: null };
  const answer = elevenLabsAnswerSchema.safeParse(await response.json());
  if (!answer.success) {
    const reason = "ElevenLabs's answer has no audio and character times";
    throw kvvideoProblem('NARRATION_FAILED', reason, { service, reason });
  }
  return { audio: Buffer.from(answer.data.audio_base64, 'base64'), alignment: answer.data.alignment === null ? null : alignmentOf(answer.data.alignment, spoken) };
}

/** The speech a service answers for `spoken`, or `kvvideo/NARRATION_FAILED`. */
export async function speak(service: WebService, request: SpeechRequest, spoken: string, key: string, fetch: Fetch, signal: AbortSignal): Promise<Speech> {
  const timeout = new AbortController();
  const timer = setTimeout(() => timeout.abort(new Error(`no answer in ${String(requestTimeoutMs / 1000)} s`)), requestTimeoutMs);
  try {
    const response = await fetch(request.url, { method: 'POST', headers: request.headers, body: request.body, signal: AbortSignal.any([signal, timeout.signal]) });
    if (!response.ok) {
      const reason = withoutKey((await response.text()).slice(0, 300), key);
      throw kvvideoProblem('NARRATION_FAILED', `${service} answered ${String(response.status)}: ${reason}`, { service, status: response.status, reason });
    }
    return await speechOf(service, response, spoken);
  } catch (error) {
    if (signal.aborted || error instanceof ProblemError) throw error;
    const reason = withoutKey(timeout.signal.aborted ? reasonOf(timeout.signal.reason) : reasonOf(error), key);
    throw kvvideoProblem('NARRATION_FAILED', `${service} couldn't be reached: ${reason}`, { service, reason });
  } finally {
    clearTimeout(timer);
  }
}
