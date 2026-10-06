import { z, type Ctx } from '@kvman/sdk';
import { insideWorkspace, workspaceRelative } from '../folders.ts';
import { jobOptions } from '../job-options.ts';
import { binResult, lastOutputLine, runBin } from '../run-bin.ts';

// The `preset` connector's commands (plan 09 §9.1): `kvman-preset new` writes a preset skeleton, and
// `kvman-preset check` validates a preset's references. Both take the file as given, relative to the workspace
// folder, since the bin runs with the workspace folder as its working folder.

const fileField = z.string().min(1).describe('The preset file, relative to the workspace folder.');

const newOutputSchema = z.object({ file: z.string() });

const checkOutputSchema = z.array(z.object({ file: z.string(), message: z.string(), hint: z.string() }));

async function newPreset(ctx: Ctx, workspaceFolder: string, name: string, file: string): Promise<{ file: string }> {
  insideWorkspace(workspaceFolder, file, 'file');
  const run = await runBin('kvman-preset', ['new', file, '--name', name], workspaceFolder, ctx.job.signal);
  const created = binResult(ctx.log, 'kvman-preset', run, newOutputSchema);
  return { file: workspaceRelative(workspaceFolder, created.file) };
}

async function checkPreset(ctx: Ctx, workspaceFolder: string, file: string): Promise<z.output<typeof checkOutputSchema>> {
  insideWorkspace(workspaceFolder, file, 'file');
  const run = await runBin('kvman-preset', ['check', file], workspaceFolder, ctx.job.signal);
  const line = lastOutputLine(run.stdout);
  if (line !== undefined) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(line);
    } catch {
      parsed = undefined;
    }
    if (parsed !== undefined) {
      const findings = checkOutputSchema.safeParse(parsed);
      if (findings.success) return findings.data;
    }
  }
  return binResult(ctx.log, 'kvman-preset', run, checkOutputSchema);
}

export function registerPreset(ctx: Ctx): void {
  ctx.registerCommand('kvbuilder.preset.new', {
    description: 'Writes a preset that runs as-is, for adding extensions and settings to.',
    public: true,
    ...jobOptions['kvbuilder.preset.new'],
    input: z.object({ name: z.string().min(1).describe('The preset name, as kernel.health.get reports it.'), file: fileField }),
    output: z.object({ file: z.string() }),
    handle: (input) => newPreset(ctx, ctx.job.workspace.path, input.name, input.file),
  });
  ctx.registerCommand('kvbuilder.preset.check', {
    description: "Checks a preset's schema and its extensions, settings, and home page.",
    public: true,
    ...jobOptions['kvbuilder.preset.check'],
    input: z.object({ file: fileField }),
    output: z.array(z.object({ file: z.string(), message: z.string(), hint: z.string() })),
    handle: (input) => checkPreset(ctx, ctx.job.workspace.path, input.file),
  });
}
