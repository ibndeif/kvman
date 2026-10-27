import { z, type Ctx } from '@kvman/sdk';

// kvvideo's settings (plan 16 §16.2, ADR 0107, 5 and 20): no narration service until the person chooses one, and the
// programs as a name on the PATH or a full path.

export const narrationServices = ['elevenlabs', 'openai', 'piper'] as const;

/** A narration service. */
export type NarrationService = (typeof narrationServices)[number];

export const browserChoices = ['auto', 'chrome', 'msedge'] as const;

/** Which installed browser records. */
export type BrowserChoice = (typeof browserChoices)[number];

export const programNames = ['ffmpeg', 'ffprobe', 'piper'] as const;

/** A program kvvideo runs. */
export type ProgramName = (typeof programNames)[number];

export const settingSchemas = {
  service: z.enum(narrationServices).nullable(),
  voice: z.string().min(1).max(500).nullable(),
  model: z.string().min(1).max(100).nullable(),
  browser: z.enum(browserChoices),
  program: z.string().min(1).max(1000),
};

/** The setting that names a program. */
export function programSetting(program: ProgramName): `kvvideo.programs.${ProgramName}` {
  return `kvvideo.programs.${program}`;
}

export function registerSettings(ctx: Ctx): void {
  ctx.registerSetting('kvvideo.narration.service', { description: 'The text-to-speech service that narrates; null until the person chooses one.', schema: settingSchemas.service, default: null });
  ctx.registerSetting('kvvideo.narration.voice', { description: "The narration voice: a voice id for ElevenLabs or OpenAI, or the path of a Piper voice's .onnx file; null is the service's default.", schema: settingSchemas.voice, default: null });
  ctx.registerSetting('kvvideo.narration.model', { description: "The narration model of ElevenLabs or OpenAI; null is the service's default.", schema: settingSchemas.model, default: null });
  ctx.registerSetting('kvvideo.browser', { description: 'The installed browser that records pages: auto tries Chrome, then Edge.', schema: settingSchemas.browser, default: 'auto', scopes: ['global'] });
  for (const program of programNames) {
    ctx.registerSetting(programSetting(program), { description: `The ${program} program: a name on the PATH, or a full path.`, schema: settingSchemas.program, default: program, scopes: ['global'] });
  }
}
