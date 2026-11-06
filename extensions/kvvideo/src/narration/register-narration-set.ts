import { existsSync, statSync } from 'node:fs';
import path from 'node:path';
import { z, type Ctx } from '@kvman/sdk';
import { invalid } from '../problems.ts';
import { narrationServices } from '../settings.ts';

// `video narration-set` (plan 16 §16.4; ADR 0120, 8 and 26): the lead sets the narration service, its voice, and its
// model once the person agreed in an `ask` card; keys stay secrets the person adds. Piper's voice is a full path to an
// `.onnx` file with its `.onnx.json` beside it, anywhere on the computer, and Piper has no model.

export const narrationSetInputSchema = z.strictObject({
  service: z.enum(narrationServices).describe('elevenlabs, openai, or piper.'),
  voice: z.string().min(1).max(500).describe("A voice id for ElevenLabs or OpenAI; for Piper, the full path of the voice's .onnx file.").exactOptional(),
  model: z.string().min(1).max(100).describe('The ElevenLabs or OpenAI model; Piper has none.').exactOptional(),
});

/** What `narration-set` takes. */
export type NarrationSetInput = z.output<typeof narrationSetInputSchema>;

const isFile = (file: string): boolean => existsSync(file) && statSync(file).isFile();

/** Checks a Piper choice: a full path to an existing `.onnx` voice with its `.onnx.json`, and no model. */
export function checkPiperChoice(input: NarrationSetInput): void {
  if (input.model !== undefined) throw invalid('Piper has no model; leave model out.', { model: input.model });
  const voice = input.voice;
  if (voice === undefined) throw invalid("Piper needs its voice: the full path of the voice's .onnx file.");
  if (!path.isAbsolute(voice) || path.extname(voice).toLowerCase() !== '.onnx') throw invalid(`Piper's voice ${voice} must be the full path of an .onnx file.`, { voice });
  if (!isFile(voice)) throw invalid(`Piper's voice ${voice} doesn't exist.`, { voice });
  if (!isFile(`${voice}.json`)) throw invalid(`Piper's voice ${voice} has no ${path.basename(voice)}.json beside it.`, { voice });
}

export function registerNarrationSet(ctx: Ctx): void {
  ctx.registerCommand('kvvideo.narration.set', {
    description: 'Sets the narration service, its voice, and its model, once the person agreed to them.',
    input: narrationSetInputSchema,
    output: z.strictObject({}),
    public: true,
    retries: 0,
    timeoutMs: 60_000,
    handle: async (input) => {
      if (input.service === 'piper') checkPiperChoice(input);
      await ctx.settings.set('kvvideo.narration.service', input.service, { scope: 'global' });
      await ctx.settings.set('kvvideo.narration.voice', input.voice ?? null, { scope: 'global' });
      await ctx.settings.set('kvvideo.narration.model', input.model ?? null, { scope: 'global' });
      return {};
    },
  });
}
