import { readFileSync } from 'node:fs';
import path from 'node:path';
import { kernelCommandSchemas, presetSchema, ProblemError, z, type Ctx, type Preset } from '@kvman/sdk';
import { insideWorkspace } from '../folders.ts';
import { invalid } from '../problems.ts';

const fileField = z.string().min(1).describe('The preset file, relative to the workspace folder.');

function readPreset(workspaceFolder: string, file: string): Preset {
  const absolute = insideWorkspace(workspaceFolder, file, 'file');
  let text: string;
  try {
    text = readFileSync(absolute, 'utf8');
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
      throw new ProblemError({ code: 'NOT_FOUND', message: `The preset file ${file} does not exist.`, params: { file } });
    }
    throw invalid(`The preset file ${file} could not be read.`, { file });
  }
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch (error) {
    if (!(error instanceof SyntaxError)) throw error;
    throw invalid(`The file ${file} is not JSON.`, { file });
  }
  const parsed = presetSchema.safeParse(value);
  if (!parsed.success) throw invalid(`The file ${file} is not a preset.`, { file });
  const extensions = { ...parsed.data.extensions };
  for (const [name, source] of Object.entries(extensions)) {
    if (!source.startsWith('path:')) continue;
    const folder = source.slice('path:'.length);
    extensions[name] = `path:${path.isAbsolute(folder) ? folder : path.resolve(path.dirname(absolute), folder)}`;
  }
  return { ...parsed.data, extensions };
}

export function registerAppPreset(ctx: Ctx): void {
  ctx.registerCommand('kvbuilder.app.preset.settings.set', {
    description: "Sets one value of the running app's preset; it applies at the next start.",
    public: true,
    retries: 0,
    input: kernelCommandSchemas['kernel.preset.settings.set'].input.extend({
      key: z.string().min(1).describe('The full setting key in the running preset.'),
      value: z.json().describe('The value to store in the running preset.'),
    }),
    output: kernelCommandSchemas['kernel.preset.settings.set'].output,
    handle: (input) => ctx.exec('kernel.preset.settings.set', input),
  });
  ctx.registerCommand('kvbuilder.app.preset.settings.reset', {
    description: "Removes one value from the running app's preset; it applies at the next start.",
    public: true,
    retries: 0,
    input: kernelCommandSchemas['kernel.preset.settings.reset'].input.extend({
      key: z.string().min(1).describe('The full setting key to remove from the running preset.'),
    }),
    output: kernelCommandSchemas['kernel.preset.settings.reset'].output,
    handle: (input) => ctx.exec('kernel.preset.settings.reset', input),
  });
  ctx.registerCommand('kvbuilder.app.preset.save', {
    description: 'Saves a preset file of the workspace as a preset of this kvman, to start later with kvman --preset <name>.',
    public: true,
    retries: 0,
    input: z.strictObject({ file: fileField, replace: z.boolean().exactOptional().describe('Overwrite a saved preset with the same name when true.') }),
    output: z.strictObject({ file: z.string(), name: z.string() }),
    handle: async ({ file, replace }) => {
      const preset = readPreset(ctx.job.workspace.path, file);
      const saved = await ctx.exec('kernel.presets.save', { preset, ...(replace === undefined ? {} : { replace }) });
      return { file: saved.file, name: preset.name };
    },
  });
}
