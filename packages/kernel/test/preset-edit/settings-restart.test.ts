import { rmSync } from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { ProblemError } from '@kvman/sdk';
import { restorePresetBackup, type Kernel } from '../../src/index.ts';
import { startPresetKernel, startSettingsRun, storedPreset, userCall, withOneWorker, writeExtensionPackage } from './support.ts';

const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

const presetOnly = [{ key: 'a.mode', type: 'string', default: 'old', scopes: [] }] as const;

async function modeOf(kernel: Kernel): Promise<unknown> {
  const settings = await kernel.exec('kernel.settings.list', {}, userCall());
  return Array.isArray(settings) ? settings.find((setting: { key: string }) => setting.key === 'a.mode') : undefined;
}

describe('a value edit applies at the next start (02 §2.10, ADR 0030, 4)', { timeout: 30_000 }, () => {
  it('QA42-H6 the value is the running one until a restart, then it comes from the preset', async () => {
    const { kernel, file, home, homeFolder } = await startSettingsRun(roots, presetOnly, undefined);
    try {
      await kernel.exec('kernel.preset.settings.set', { key: 'a.mode', value: 'new' }, userCall());
      expect(await modeOf(kernel)).toMatchObject({ value: 'old', source: 'default' });
    } finally {
      await kernel.close();
    }
    const restarted = await startPresetKernel({ home, homeFolder, preset: withOneWorker(storedPreset(file)), presetFolder: path.dirname(file), presetSource: { origin: 'home', file } });
    try {
      expect(await modeOf(restarted)).toMatchObject({ value: 'new', source: 'preset' });
    } finally {
      await restarted.close();
    }
  });

  it('QA42-E9 a start that fails after a value edit is undone from the backup', async () => {
    const { kernel, file, home, homeFolder, root, preset } = await startSettingsRun(roots, presetOnly, undefined);
    const laterFolder = path.join(root, 'later');
    writeExtensionPackage(laterFolder, { name: '@test/later', namespace: 'later' });
    try {
      await kernel.exec('kernel.extensions.install', { source: `path:${laterFolder}` }, userCall());
      await kernel.exec('kernel.preset.settings.set', { key: 'later.mode', value: 'on' }, userCall());
    } finally {
      await kernel.close();
    }
    const start = (rolledBack?: ProblemError['problem']) =>
      startPresetKernel({
        home,
        homeFolder,
        preset: withOneWorker(storedPreset(file)),
        presetFolder: path.dirname(file),
        presetSource: { origin: 'home', file },
        ...(rolledBack === undefined ? {} : { rolledBack }),
      });
    const failure: unknown = await start().then(
      () => undefined,
      (error: unknown) => error,
    );
    expect(failure).toBeInstanceOf(ProblemError);
    if (!(failure instanceof ProblemError)) return;
    expect(failure.problem.code).toBe('VALIDATION_FAILED');
    expect(restorePresetBackup(file)).toBe(true);
    expect(storedPreset(file)).toEqual(preset);
    const undone = await start(failure.problem);
    try {
      expect(await undone.exec('kernel.health.get', {}, userCall())).toMatchObject({ rolledBack: failure.problem });
    } finally {
      await undone.close();
    }
  });
});
