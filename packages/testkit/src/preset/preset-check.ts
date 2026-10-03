import { readFileSync } from 'node:fs';
import path from 'node:path';
import { healthSchema, kernelQuerySchemas, presetSchema, ProblemError, z, type Json, type Preset } from '@kvman/sdk';
import { callQuery } from '../running/call-query.ts';
import { KvmanUnreachableError, type RunningKvman } from '../running/running-kvman.ts';
import { presetReach, type PresetReach } from './preset-reach.ts';

// `kvman-preset check` (plan 09 §9.1): the preset's schema, then its references. Settings: a key's namespace must be
// `kernel` or one of the preset's extensions'; a loaded extension's key must be registered and its value must match
// its schema. Pages: `kvwebui.home` must be a built-in page, a page of a loaded extension's ui.get, or under an
// unloaded extension's namespace. With `npm:` extensions in the preset, an unknown namespace isn't checked. With no
// running kvman only the schema and the `path:` folders are checked.

/** A preset finding: `file` is the checked file exactly as given. */
export type PresetFinding = { file: string; message: string; hint: string };

/** The check's findings, and whether a running kvman answered. */
export type PresetCheck = { findings: PresetFinding[]; running: boolean };

// kvwebui's own pages (plan 06 §6.6), which no ui.get lists.
const builtInPages = ['kvwebui.settings', 'kvwebui.extensions'];

const extensionsListOutput = kernelQuerySchemas['kernel.extensions.list'].output;
const settingsListOutput = kernelQuerySchemas['kernel.settings.list'].output;
const uiGetOutput = z.object({ pages: z.array(z.object({ id: z.string() }).loose()) }).loose();

type SettingInfo = z.output<typeof settingsListOutput>[number];

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

function settingProblems(settings: Readonly<Record<string, Json>>, reach: PresetReach, registered: readonly SettingInfo[]): { message: string; hint: string }[] {
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

async function pagesOf(running: RunningKvman, namespace: string): Promise<string[] | ProblemError> {
  let answer: z.output<typeof uiGetOutput>;
  try {
    answer = await callQuery(running, `${namespace}.ui.get`, {}, uiGetOutput);
  } catch (error) {
    if (error instanceof ProblemError) return error;
    throw error;
  }
  return answer.pages.map((page) => `${namespace}.${page.id}`);
}

async function homeProblems(running: RunningKvman, home: Json | undefined, reach: PresetReach): Promise<{ message: string; hint: string }[]> {
  if (typeof home !== 'string' || builtInPages.includes(home)) return [];
  const namespace = home.split('.')[0] ?? '';
  if (reach.unloaded.has(namespace) || (reach.hasNpm && !reach.loaded.has(namespace))) return [];
  const hint = 'kvwebui.home names a page with no params, as <namespace>.<page>, or kvwebui.extensions.';
  if (!reach.loaded.has(namespace)) return [{ message: `kvwebui.home ${home} is under ${namespace}, which isn't one of the preset's extensions.`, hint }];
  const pages = await pagesOf(running, namespace);
  if (pages instanceof ProblemError) return [{ message: `kvwebui.home ${home}: ${namespace}.ui.get fails with ${pages.problem.code}.`, hint }];
  return pages.includes(home) ? [] : [{ message: `kvwebui.home ${home} isn't a page of ${namespace}.`, hint: `${namespace}'s pages: ${pages.join(', ') || 'none'}.` }];
}

function toFindings(file: string, problems: { message: string; hint: string }[]): PresetFinding[] {
  return problems.map((problem) => ({ file, ...problem }));
}

// A kvman that was found counts as running only once it answers; a refused connection means it doesn't.
async function answering(found: RunningKvman | undefined): Promise<RunningKvman | undefined> {
  if (found === undefined) return undefined;
  try {
    await callQuery(found, 'kernel.health.get', {}, healthSchema);
    return found;
  } catch (error) {
    if (error instanceof KvmanUnreachableError) return undefined;
    throw error;
  }
}

/** Checks the preset in `file`: `file` resolves against the current working folder and stays as given in findings. */
export async function checkPreset(file: string, found: RunningKvman | undefined): Promise<PresetCheck> {
  const running = await answering(found);
  const absolute = path.resolve(file);
  const read = readPreset(absolute);
  if ('problems' in read) return { findings: toFindings(file, read.problems), running: running !== undefined };
  const preset = read.preset;
  const local = presetReach(preset, absolute, undefined);
  if (running === undefined) return { findings: toFindings(file, local.problems), running: false };
  try {
    const reach = presetReach(preset, absolute, await callQuery(running, 'kernel.extensions.list', {}, extensionsListOutput));
    const registered = await callQuery(running, 'kernel.settings.list', {}, settingsListOutput);
    const settings = preset.settings ?? {};
    return { findings: toFindings(file, [...reach.problems, ...settingProblems(settings, reach, registered), ...(await homeProblems(running, settings['kvwebui.home'], reach))]), running: true };
  } catch (error) {
    if (error instanceof KvmanUnreachableError) return { findings: toFindings(file, local.problems), running: false };
    throw error;
  }
}
