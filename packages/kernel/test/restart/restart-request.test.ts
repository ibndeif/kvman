import { rmSync } from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import type { Preset } from '@kvman/sdk';
import { extensionCall, makeRoot, startPresetKernel, userCall, writePresetFile } from '../preset-edit/support.ts';

const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

async function start(rolledBack?: { code: 'EXTENSION_INVALID'; message: string; params?: Record<string, string> }) {
  const { home, homeFolder } = makeRoot(roots);
  const file = path.join(home, 'presets', 'mine.json');
  const preset: Preset = { name: 'mine', extensions: {}, settings: { 'kernel.workers': 1 } };
  writePresetFile(file, preset);
  return startPresetKernel({ home, homeFolder, preset, presetFolder: path.dirname(file), presetSource: { origin: 'home', file }, ...(rolledBack === undefined ? {} : { rolledBack }) });
}

describe('kernel.restart (02 §2.12 and §2.14, ADR 0024, 2 and 6)', { timeout: 30_000 }, () => {
  it('QA36-H1 and QA36-E1 kernel.restart answers at once, reports the request, and an extension may call it; more calls answer the same', async () => {
    const kernel = await start();
    try {
      const requested = kernel.restartRequested.then(() => 'requested');
      expect(await kernel.exec('kernel.restart', {}, userCall())).toEqual({ restarting: true });
      expect(await requested).toBe('requested');
      expect(await kernel.exec('kernel.restart', {}, userCall())).toEqual({ restarting: true });
      expect(await kernel.exec('kernel.restart', {}, extensionCall('@test/caller'))).toEqual({ restarting: true });
    } finally {
      await kernel.close();
    }
  });

  it('QA36-H1 kernel.restart can only run as a sync call, so it is never queued or retried', async () => {
    const kernel = await start();
    try {
      await expect(kernel.execAsync('kernel.restart', {}, userCall())).rejects.toMatchObject({ problem: { code: 'VALIDATION_FAILED' } });
    } finally {
      await kernel.close();
    }
  });

  it('QA36-H2 health has rolledBack only for a start that was given one', async () => {
    const plain = await start();
    try {
      expect(await plain.exec('kernel.health.get', {}, userCall())).not.toHaveProperty('rolledBack');
    } finally {
      await plain.close();
    }
    const problem = { code: 'EXTENSION_INVALID', message: 'The extension @acme/x is invalid.', params: { name: '@acme/x' } } as const;
    const undone = await start(problem);
    try {
      expect(await undone.exec('kernel.health.get', {}, userCall())).toMatchObject({ rolledBack: problem });
    } finally {
      await undone.close();
    }
  });
});
