import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { ProblemError, z, type Problem } from '@kvman/sdk';
import { createTestKernel, type TestKernel } from '../index.ts';
import { docsFindings } from './docs-findings.ts';
import { fieldFindings } from './field-descriptions.ts';
import type { CheckedFinding } from './finding.ts';
import { localeFindings, type RequiredKey } from './locale-keys.ts';
import { scanProjectTimers } from './timer-scan.ts';
import { uiKeys } from './ui-keys.ts';

// `kvman-check` (plan 09 §9.2, ADR 0009, 116): it loads the project's extension alone in a test kernel and reports a
// refused load (one problem at a time, since a load stops at its first error), public input fields with no
// description, missing locale keys, docs-pair warnings, and timer warnings.

const manifestSchema = z.object({ name: z.string(), kvman: z.object({}).loose() }).loose();

function notAProject(): CheckedFinding {
  return { message: 'This folder has no package.json with a kvman field.', hint: 'Run kvman-check in the extension project\'s folder.', warning: false };
}

function loadFinding(problem: Problem): CheckedFinding {
  return { message: `The extension doesn't load: ${problem.message}`, hint: 'Fix what the kernel names; kvman-check reports the next problem once this one is gone.', warning: false };
}

function uiFailure(namespace: string, problem: Problem): CheckedFinding {
  return { message: `${namespace}.ui.get fails with ${problem.code}: ${problem.message}`, hint: 'kvwebui shows no UI from an extension whose ui.get fails; make it return its pages.', warning: false };
}

async function uiAnswer(kernel: TestKernel, namespace: string): Promise<{ keys: string[] } | { failure: CheckedFinding }> {
  try {
    return { keys: uiKeys(await kernel.exec(`${namespace}.ui.get`, {})) };
  } catch (error) {
    if (error instanceof ProblemError) return { failure: uiFailure(namespace, error.problem) };
    throw error;
  }
}

async function loadedFindings(kernel: TestKernel, folder: string, name: string): Promise<CheckedFinding[]> {
  const extension = (await kernel.exec('kernel.extensions.list', {})).find((candidate) => candidate.name === name);
  if (extension === undefined) return [];
  const { namespace } = extension;
  const required: RequiredKey[] = [{ key: `${namespace}.title`, usedBy: 'the Settings and Extensions pages' }];
  for (const setting of extension.settings) required.push({ key: `${setting.key}.title`, usedBy: 'the Settings page' });
  const findings: CheckedFinding[] = fieldFindings([...extension.commands, ...extension.queries]);
  findings.push(...(await docsFindings(kernel, namespace, extension.queries)));
  if (extension.queries.some((query) => query.name === `${namespace}.ui.get`)) {
    const answer = await uiAnswer(kernel, namespace);
    if ('failure' in answer) findings.push(answer.failure);
    else for (const key of answer.keys) required.push({ key, usedBy: `${namespace}.ui.get` });
  }
  return [...findings, ...localeFindings(folder, required)];
}

/** Checks the extension project in `folder`. */
export async function checkExtension(folder: string): Promise<CheckedFinding[]> {
  const manifestFile = path.join(folder, 'package.json');
  if (!existsSync(manifestFile)) return [notAProject()];
  const manifest = manifestSchema.safeParse(JSON.parse(readFileSync(manifestFile, 'utf8')));
  if (!manifest.success) return [notAProject()];
  const timers = scanProjectTimers(folder);
  let kernel: TestKernel;
  try {
    kernel = await createTestKernel({ extensions: [folder], logLevel: 'warn' });
  } catch (error) {
    if (error instanceof ProblemError) return [loadFinding(error.problem), ...timers];
    throw error;
  }
  try {
    return [...(await loadedFindings(kernel, folder, manifest.data.name)), ...timers];
  } finally {
    await kernel.close();
  }
}
