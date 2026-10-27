import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { z, type Ctx } from '@kvman/sdk';
import { answerPath } from '../files/answer-path.ts';
import { placeOutput, workFolder } from '../files/place-output.ts';
import { outputPath } from '../files/workspace-paths.ts';
import { mediaDuration } from '../programs/media-duration.ts';
import { programOf } from '../programs/programs.ts';
import { kvvideoProblem } from '../problems.ts';
import { keySecrets } from '../setup/narration-readiness.ts';
import type { NarrationService } from '../settings.ts';
import { timedCaptions } from './captions.ts';
import { piperNarration } from './piper.ts';
import { speak, speechRequest } from './speech-services.ts';

// `video narrate` (plan 16 §16.6): the chosen service speaks the text into an MP3 in the workspace, and the answer has
// its length and its captions. The output is checked before anything runs or is paid for.

export const narrateInputSchema = z.strictObject({
  text: z.string().min(1).max(4000).describe('What the narrator says: one scene, a few sentences.'),
  file: z.string().min(1).max(1000).describe('The .mp3 file to write, in the workspace.'),
  replace: z.boolean().describe('Write over an existing file.').exactOptional(),
});

export const narrateOutputSchema = z.object({
  file: z.string(),
  durationMs: z.number().int().nonnegative(),
  captions: z.array(z.object({ text: z.string(), startMs: z.number().int(), endMs: z.number().int() })),
});

async function chosenService(ctx: Ctx): Promise<NarrationService> {
  const service = await ctx.settings.get('kvvideo.narration.service');
  if (service === null) throw kvvideoProblem('NARRATION_NOT_SET', 'No narration service is chosen; set kvvideo.narration.service.', { setting: 'kvvideo.narration.service' });
  return service;
}

async function narrateInto(ctx: Ctx, service: NarrationService, text: string, folder: string): Promise<string> {
  const choice = { voice: await ctx.settings.get('kvvideo.narration.voice'), model: await ctx.settings.get('kvvideo.narration.model') };
  if (service === 'piper') {
    if (choice.voice === null) throw kvvideoProblem('NARRATION_NOT_SET', "Piper has no voice; set kvvideo.narration.voice to a voice's .onnx file.", { setting: 'kvvideo.narration.voice' });
    return piperNarration({ piper: await programOf(ctx, 'piper'), ffmpeg: await programOf(ctx, 'ffmpeg') }, choice.voice, text, folder, ctx.job.signal);
  }
  const secret = keySecrets[service];
  const key = await ctx.secrets.get(secret);
  if (key === undefined) throw kvvideoProblem('NARRATION_KEY_MISSING', `The ${service} key is missing; add the secret ${secret} on kvvideo's extension page.`, { service, secret });
  const audio = await speak(service, speechRequest(service, text, choice, key), key, fetch, ctx.job.signal);
  const file = path.join(folder, 'narration.mp3');
  writeFileSync(file, audio);
  return file;
}

export function registerNarration(ctx: Ctx): void {
  ctx.registerCommand('kvvideo.narration.make', {
    description: 'Narrates text with the chosen text-to-speech service into an MP3 file in the workspace, with its length and captions.',
    input: narrateInputSchema,
    output: narrateOutputSchema,
    public: true,
    retries: 0,
    timeoutMs: 120_000,
    handle: async (input) => {
      const root = ctx.job.workspace.path;
      const output = outputPath(root, input.file, '.mp3', input.replace === true);
      const service = await chosenService(ctx);
      const work = workFolder();
      try {
        const made = await narrateInto(ctx, service, input.text, work.folder);
        const duration = await mediaDuration(await programOf(ctx, 'ffprobe'), made, ctx.job.signal);
        if (!duration.ok) throw kvvideoProblem('NARRATION_FAILED', `ffprobe couldn't read the narration: ${duration.reason}`, { service, reason: duration.reason });
        placeOutput(made, output);
        return { file: answerPath(root, output), durationMs: duration.ms, captions: timedCaptions(input.text, duration.ms) };
      } finally {
        work.remove();
      }
    },
  });
}
