import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import type { Ctx } from '@kvman/sdk';
import { mediaDuration } from '../programs/media-duration.ts';
import type { Program } from '../programs/run-program.ts';
import { kvvideoProblem } from '../problems.ts';
import type { NarrationService } from '../settings.ts';
import type { Alignment } from './alignment.ts';
import { cachedSentence, keepSentence, sentenceKey, type CachedSentence } from './narration-cache.ts';
import { piperSentence } from './piper.ts';
import { resolvedChoice, speak, speechRequest, type Fetch } from './speech-services.ts';

// One sentence of a narration (plan 16 §16.6): taken from the cache when it was said the same way before, else spoken
// by the service, measured with ffprobe, and kept in the cache. Its audio is written into the work folder.

export type Voice = {
  service: NarrationService;
  choice: { voice: string | null; model: string | null };
  key: string | null;
  tone: string | null;
  speed: number;
  programs: { ffprobe: Program; piper: Program | null };
  fetch: Fetch;
  signal: AbortSignal;
};

export type SaidSentence = { file: string; durationMs: number; alignment: Alignment | null; reused: boolean };

/** The sentence's spoken text and its neighbours, as sent. */
export type SentenceText = { spoken: string; previous: string | null; next: string | null };

function failed(service: NarrationService, reason: string): Error {
  return kvvideoProblem('NARRATION_FAILED', `${service} couldn't narrate: ${reason}`, { service, reason });
}

async function measured(voice: Voice, file: string): Promise<number> {
  const duration = await mediaDuration(voice.programs.ffprobe, file, voice.signal);
  if (!duration.ok) throw failed(voice.service, `ffprobe couldn't read the narration: ${duration.reason}`);
  return duration.ms;
}

async function spokenNow(voice: Voice, text: SentenceText, file: string): Promise<Omit<CachedSentence, 'audio'>> {
  if (voice.service === 'piper') {
    if (voice.choice.voice === null || voice.programs.piper === null) throw failed('piper', 'no voice');
    await piperSentence(voice.programs.piper, voice.choice.voice, text.spoken, file, voice.speed, voice.signal);
    return { type: 'audio/wav', durationMs: await measured(voice, file), alignment: null };
  }
  const key = voice.key ?? '';
  const request = speechRequest(voice.service, text.spoken, voice.choice, key, { tone: voice.tone, speed: voice.speed, previous: text.previous, next: text.next });
  const speech = await speak(voice.service, request, text.spoken, key, voice.fetch, voice.signal);
  writeFileSync(file, speech.audio);
  return { type: 'audio/mpeg', durationMs: await measured(voice, file), alignment: speech.alignment };
}

export async function saySentence(ctx: Ctx, voice: Voice, text: SentenceText, folder: string, index: number): Promise<SaidSentence> {
  const choice = voice.service === 'piper' ? voice.choice : resolvedChoice(voice.service, voice.choice);
  const key = sentenceKey({ service: voice.service, voice: choice.voice, model: choice.model, tone: voice.tone, speed: voice.speed, spoken: text.spoken });
  const cached = await cachedSentence(ctx, key);
  if (cached !== undefined) {
    const file = path.join(folder, `sentence-${String(index)}.${cached.type === 'audio/wav' ? 'wav' : 'mp3'}`);
    writeFileSync(file, cached.audio);
    return { file, durationMs: cached.durationMs, alignment: cached.alignment, reused: true };
  }
  const file = path.join(folder, `sentence-${String(index)}.${voice.service === 'piper' ? 'wav' : 'mp3'}`);
  const said = await spokenNow(voice, text, file);
  await keepSentence(ctx, key, { audio: readFileSync(file), ...said });
  return { file, durationMs: said.durationMs, alignment: said.alignment, reused: false };
}
