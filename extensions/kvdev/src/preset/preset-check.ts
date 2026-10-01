import { readFileSync } from 'node:fs';
import { presetSchema, ProblemError, z, type Ctx, type Json, type Preset } from '@kvman/sdk';
import { insideWorkspace, workspaceRelative } from '../folders.ts';
import { presetReach, type PresetReach } from './preset-extensions.ts';

// `preset check` (plan 09 §9.1, ADR 0009, 122): the preset's schema, then its references. Settings: a key's namespace
// must be `kernel` or one of the preset's extensions'; a loaded extension's key must be registered and its value must
// match its schema. Pages: `kvwebui.home` must be a built-in page, a page of a loaded extension's ui.get, or under an
// unloaded extension's namespace. With `npm:` extensions in the preset, an unknown namespace isn't checked.

export type PresetFinding = { file: string; message: string; hint: string };

// kvwebui's own pages (plan 06 §6.6), which no ui.get lists.
const builtInPages = ['kvwebui.settings', 'kvwebui.extensions'];

function readPreset(absolute: string): { preset: Preset } | { problems: { message: string; hint: string }[] } {
  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(absolute, 'utf8'));
  } catch (error) {
    if (error instanceof SyntaxError || (error instanceof Error && 'code' in error && error.code === 'ENOENT')) return { problems: [{ message: `The preset can't be read: ${error.message}`, hint: 'A preset is one JSON object.' }] };
    throw error;
  }
  const parsed = presetSchema.safeParse(raw);
  if (parsed.success) return { preset: parsed.data };
  return { problems: parsed.error.issues.map((issue) => ({ message: `${issue.path.join('.') || 'preset'}: ${issue.message}`, hint: 'A preset is { name, extensions, settings? }, with no other keys (plan 02 §2.10).' })) };
}

async function settingProblems(ctx: Ctx, settings: Readonly<Record<string, Json>>, reach: PresetReach): Promise<{ message: string; hint: string }[]> {
  const registered = await ctx.exec('kernel.settings.list', {});
  const problems: { message: string; hint: string }[] = [];
  for (const [key, value] of Object.entries(settings)) {
    const namespace = key.split('.')[0] ?? '';
    if (namespace === 'kernel' || reach.loaded.has(namespace)) {
      const setting = registered.find((candidate) => candidate.key === key);
      if (setting === undefined) problems.push({ message: `${key} isn't a setting of ${namespace}.`, hint: 'kernel.settings.list lists every registered key.' });
      else {
        const checked = z.fromJSONSchema(setting.schema).safeParse(value);
        if (!checked.success) problems.push({ message: `${key}: ${checked.error.issues.map((issue) => issue.message).join('; ')}`, hint: `${key} is: ${setting.description}` });
      }
    } else if (!reach.unloaded.has(namespace) && !reach.hasNpm) {
      problems.push({ message: `${key} belongs to ${namespace}, which isn't kernel or one of the preset's extensions.`, hint: 'Add the extension that registers it, or remove the key.' });
    }
  }
  return problems;
}

async function pagesOf(ctx: Ctx, namespace: string): Promise<string[] | ProblemError> {
  const answer = await ctx.exec(`${namespace}.ui.get`, {}).catch((error: unknown) => {
    if (error instanceof ProblemError) return error;
    throw error;
  });
  if (answer instanceof ProblemError) return answer;
  const pages = z.object({ pages: z.array(z.object({ id: z.string() }).loose()) }).loose().safeParse(answer);
  return pages.success ? pages.data.pages.map((page) => `${namespace}.${page.id}`) : [];
}

async function homeProblems(ctx: Ctx, home: Json | undefined, reach: PresetReach): Promise<{ message: string; hint: string }[]> {
  if (typeof home !== 'string' || builtInPages.includes(home)) return [];
  const namespace = home.split('.')[0] ?? '';
  if (reach.unloaded.has(namespace) || (reach.hasNpm && !reach.loaded.has(namespace))) return [];
  const hint = 'kvwebui.home names a page with no params, as <namespace>.<page>, or kvwebui.extensions.';
  if (!reach.loaded.has(namespace)) return [{ message: `kvwebui.home ${home} is under ${namespace}, which isn't one of the preset's extensions.`, hint }];
  const pages = await pagesOf(ctx, namespace);
  if (pages instanceof ProblemError) return [{ message: `kvwebui.home ${home}: ${namespace}.ui.get fails with ${pages.problem.code}.`, hint }];
  return pages.includes(home) ? [] : [{ message: `kvwebui.home ${home} isn't a page of ${namespace}.`, hint: `${namespace}'s pages: ${pages.join(', ') || 'none'}.` }];
}

export async function checkPreset(ctx: Ctx, workspaceFolder: string, file: string): Promise<PresetFinding[]> {
  const absolute = insideWorkspace(workspaceFolder, file, 'file');
  const relative = workspaceRelative(workspaceFolder, absolute);
  const read = readPreset(absolute);
  const problems = 'problems' in read ? read.problems : await referenceProblems(ctx, read.preset, absolute);
  return problems.map((problem) => ({ file: relative, ...problem }));
}

async function referenceProblems(ctx: Ctx, preset: Preset, absolute: string): Promise<{ message: string; hint: string }[]> {
  const reach = presetReach(preset, absolute, await ctx.exec('kernel.extensions.list', {}));
  const settings = preset.settings ?? {};
  return [...reach.problems, ...(await settingProblems(ctx, settings, reach)), ...(await homeProblems(ctx, settings['kvwebui.home'], reach))];
}
