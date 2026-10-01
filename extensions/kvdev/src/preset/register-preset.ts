import { z, type Ctx } from '@kvman/sdk';
import { jobOptions } from '../job-options.ts';
import { checkPreset } from './preset-check.ts';
import { newPreset } from './preset-new.ts';

// The `preset` connector's commands (plan 09 §9.1): write a preset skeleton, and check a preset's references.

const fileField = z.string().min(1).describe('The preset file, relative to the workspace folder.');

export function registerPreset(ctx: Ctx): void {
  ctx.registerCommand('kvdev.preset.new', {
    description: 'Writes a preset that runs as-is, for adding extensions and settings to.',
    public: true,
    ...jobOptions['kvdev.preset.new'],
    input: z.object({ name: z.string().min(1).describe('The preset name, as kernel.health.get reports it.'), file: fileField }),
    output: z.object({ file: z.string() }),
    handle: (input) => newPreset(ctx.job.workspace.path, input.name, input.file),
  });
  ctx.registerCommand('kvdev.preset.check', {
    description: "Checks a preset's schema and its extensions, settings, and home page.",
    public: true,
    retries: 0,
    input: z.object({ file: fileField }),
    output: z.array(z.object({ file: z.string(), message: z.string(), hint: z.string() })),
    handle: (input) => checkPreset(ctx, ctx.job.workspace.path, input.file),
  });
}
