import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { presetSchema, type Preset } from '@kvman/sdk';
import { kernelProblem } from '../problems.ts';

// Reading and writing the stored preset file (plan 02 §2.10, ADR 0010, 12 and 13): every read parses through the
// schema, and every write is validated first and lands whole or not at all, through a temporary file and a rename.

function reasonOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function targetFileFor(home: string, name: string): string {
  return path.join(home, 'presets', `${name}.json`);
}

function invalid(file: string, detail: string): Error {
  return kernelProblem('VALIDATION_FAILED', `The preset file ${file} is invalid (${detail}).`, { file });
}

export async function readStoredPreset(file: string): Promise<Preset> {
  const text = await readFile(file, 'utf8').catch((error: unknown) => {
    throw kernelProblem('VALIDATION_FAILED', `The preset file ${file} can't be read (${reasonOf(error)}).`, { file });
  });
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (error: unknown) {
    throw invalid(file, reasonOf(error));
  }
  const result = presetSchema.safeParse(parsed);
  if (!result.success) {
    throw invalid(file, result.error.issues.map((issue) => `${issue.path.join('.') || 'preset'}: ${issue.message}`).join('; '));
  }
  return result.data;
}

// The written keys are `name`, `extensions`, then `settings` when present.
export function presetFileText(file: string, preset: Preset): string {
  const ordered: Preset =
    preset.settings === undefined
      ? { name: preset.name, extensions: preset.extensions }
      : { name: preset.name, extensions: preset.extensions, settings: preset.settings };
  const result = presetSchema.safeParse(ordered);
  if (!result.success) {
    throw invalid(file, result.error.issues.map((issue) => `${issue.path.join('.') || 'preset'}: ${issue.message}`).join('; '));
  }
  return `${JSON.stringify(result.data, null, 2)}\n`;
}

// `<home>/presets/` is made when missing.
export async function writePresetFile(file: string, preset: Preset): Promise<void> {
  const text = presetFileText(file, preset);
  try {
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(`${file}.${String(process.pid)}.tmp`, text);
    await rename(`${file}.${String(process.pid)}.tmp`, file);
  } catch (error: unknown) {
    throw kernelProblem('VALIDATION_FAILED', `The preset file ${file} can't be written (${reasonOf(error)}).`, { file });
  }
}
