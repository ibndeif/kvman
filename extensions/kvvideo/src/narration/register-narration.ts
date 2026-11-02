import path from 'node:path';
import { z, type Ctx } from '@kvman/sdk';
import { answerPath } from '../files/answer-path.ts';
import { placeOutput, workFolder } from '../files/place-output.ts';
import { sidecarCaptionSchema, sidecarOutputPath, writeSidecar } from '../files/sidecar.ts';
import { outputPath } from '../files/workspace-paths.ts';
import { mediaDuration } from '../programs/media-duration.ts';
import { programOf } from '../programs/programs.ts';
import { lastLines, runProgram } from '../programs/run-program.ts';
import { invalid, kvvideoProblem } from '../problems.ts';
import { keySecrets } from '../setup/narration-readiness.ts';
import type { NarrationService } from '../settings.ts';
import { captionsOf, sentencesOf, type PlacedSentence } from './captions.ts';
import { joinNarrationArgs, sentenceGapMs } from './join-args.ts';
import { spokenOf } from './pronunciations.ts';
import { saySentence, type Voice } from './sentence-speaker.ts';

// `video narrate` (plan 16 §16.6; ADR 0115, 15, 17, 39 to 41): the text is said sentence by sentence, each from the
// cache or the chosen service, then joined with 250 ms between them into an MP3 in the workspace, with its captions
// in a sidecar beside it. Everything that can fail before a service is paid for is checked first.

export const narrateInputSchema = z.strictObject({
  text: z.string().min(1).max(4000).describe('What the narrator says: one scene, a few sentences.'),
  file: z.string().min(1).max(1000).describe('The .mp3 file to write, in the workspace.'),
  tone: z.string().min(1).max(300).describe('How it is said, as "warm and upbeat"; OpenAI only.').exactOptional(),
  speed: z.number().min(0.7).max(1.2).describe('How fast it is said: 0.7 to 1.2, 1 by default.').exactOptional(),
  replace: z.boolean().describe('Write over an existing file.').exactOptional(),
});

export const narrateOutputSchema = z.object({ file: z.string(), durationMs: z.number().int().nonnegative(), captions: z.array(sidecarCaptionSchema), reused: z.number().int().nonnegative() });

async function chosenService(ctx: Ctx): Promise<NarrationService> {
  const service = await ctx.settings.get('kvvideo.narration.service');
  if (service === null) throw kvvideoProblem('NARRATION_NOT_SET', 'No narration service is chosen; set kvvideo.narration.service.', { setting: 'kvvideo.narration.service' });
  return service;
}

async function voiceOf(ctx: Ctx, input: z.output<typeof narrateInputSchema>): Promise<Voice> {
  const service = await chosenService(ctx);
  const choice = { voice: await ctx.settings.get('kvvideo.narration.voice'), model: await ctx.settings.get('kvvideo.narration.model') };
  const shared = { service, choice, tone: input.tone ?? null, speed: input.speed ?? 1, fetch, signal: ctx.job.signal };
  const ffprobe = await programOf(ctx, 'ffprobe');
  if (service === 'piper') {
    if (choice.voice === null) throw kvvideoProblem('NARRATION_NOT_SET', "Piper has no voice; set kvvideo.narration.voice to a voice's .onnx file.", { setting: 'kvvideo.narration.voice' });
    return { ...shared, key: null, programs: { ffprobe, piper: await programOf(ctx, 'piper') } };
  }
  const secret = keySecrets[service];
  const key = await ctx.secrets.get(secret);
  if (key === undefined) throw kvvideoProblem('NARRATION_KEY_MISSING', `The ${service} key is missing; add the secret ${secret} on kvvideo's extension page.`, { service, secret });
  return { ...shared, key, programs: { ffprobe, piper: null } };
}

export function registerNarration(ctx: Ctx): void {
  ctx.registerCommand('kvvideo.narration.make', {
    description: 'Narrates text sentence by sentence with the chosen text-to-speech service into an MP3 file in the workspace, with its length and captions.',
    input: narrateInputSchema,
    output: narrateOutputSchema,
    public: true,
    retries: 0,
    timeoutMs: 300_000,
    handle: async (input) => {
      const root = ctx.job.workspace.path;
      const replace = input.replace === true;
      const output = outputPath(root, input.file, '.mp3', replace);
      const sidecar = sidecarOutputPath(output, replace, input.file);
      const voice = await voiceOf(ctx, input);
      const ffmpeg = await programOf(ctx, 'ffmpeg');
      const pronunciations = await ctx.settings.get('kvvideo.narration.pronunciations');
      const sentences = sentencesOf(input.text).map((text) => ({ text, spoken: spokenOf(text, pronunciations) }));
      if (sentences.length === 0) throw invalid('The text has nothing to say.', { text: input.text });
      const work = workFolder();
      try {
        const placed: PlacedSentence[] = [];
        const files: string[] = [];
        let startMs = 0;
        let reused = 0;
        for (const [index, sentence] of sentences.entries()) {
          ctx.job.progress({ key: 'kvvideo.progress.sentence', params: { n: index + 1, of: sentences.length } });
          const text = { spoken: sentence.spoken.text, previous: sentences[index - 1]?.spoken.text ?? null, next: sentences[index + 1]?.spoken.text ?? null };
          const said = await saySentence(ctx, voice, text, work.folder, index + 1);
          if (said.reused) reused += 1;
          files.push(said.file);
          placed.push({ text: sentence.text, spoken: sentence.spoken, startMs, durationMs: said.durationMs, alignment: said.alignment });
          startMs += said.durationMs + sentenceGapMs;
        }
        const made = path.join(work.folder, 'narration.mp3');
        const joined = await runProgram(ffmpeg, joinNarrationArgs(files, made), { signal: ctx.job.signal });
        if (joined.exitCode !== 0) throw kvvideoProblem('NARRATION_FAILED', `ffmpeg couldn't join the narration: ${lastLines(joined.output)}`, { service: voice.service, reason: lastLines(joined.output) });
        const duration = await mediaDuration(voice.programs.ffprobe, made, ctx.job.signal);
        if (!duration.ok) throw kvvideoProblem('NARRATION_FAILED', `ffprobe couldn't read the narration: ${duration.reason}`, { service: voice.service, reason: duration.reason });
        const captions = captionsOf(placed, duration.ms);
        const madeSidecar = writeSidecar(work.folder, { kind: 'narration', durationMs: duration.ms, captions });
        placeOutput(made, output);
        placeOutput(madeSidecar, sidecar);
        return { file: answerPath(root, output), durationMs: duration.ms, captions, reused };
      } finally {
        work.remove();
      }
    },
  });
}
