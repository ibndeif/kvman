import { realpathSync } from 'node:fs';
import path from 'node:path';
import type { RunProgram } from './run-program.ts';

// Whether this kvman is npm's global one (ADR 0031, 6): its own package folder must be `<npm root -g>/kvman`, compared
// as real paths, so a global folder reached through a link still matches. Only then can `npm uninstall -g kvman`
// remove it.

export type InstalledCheck = 'global' | 'elsewhere' | 'no-npm';

function realFolder(folder: string): string | undefined {
  try {
    return realpathSync.native(folder);
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') return undefined;
    throw error;
  }
}

export async function checkInstalled(packageFolder: string, runProgram: RunProgram): Promise<InstalledCheck> {
  const root = await runProgram('npm', ['root', '-g'], 'captured');
  if (!root.started || root.code !== 0) return 'no-npm';
  const globalKvman = realFolder(path.join(root.output.trim(), 'kvman'));
  return globalKvman !== undefined && globalKvman === realFolder(packageFolder) ? 'global' : 'elsewhere';
}
