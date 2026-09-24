import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { Worker } from 'node:worker_threads';

type Outcome = { check: string; outcome: 'denied' | 'allowed'; code?: string };

const [outsideFile = '', writableFile = ''] = process.argv.slice(2);
const deniedCodes = new Set(['ERR_ACCESS_DENIED', 'ERR_DLOPEN_DISABLED', 'ERR_UNKNOWN_BUILTIN_MODULE']);

function codeOf(error: unknown): string | undefined {
  return error !== null && typeof error === 'object' && 'code' in error && typeof error.code === 'string' ? error.code : undefined;
}

async function attempt(check: string, operation: () => unknown): Promise<Outcome> {
  try {
    const result = await operation();
    return result === undefined && check === 'sqlite.getBuiltinModule' ? { check, outcome: 'denied' } : { check, outcome: 'allowed' };
  } catch (error) {
    const code = codeOf(error);
    return code !== undefined && deniedCodes.has(code) ? { check, outcome: 'denied', code } : { check, outcome: 'allowed', ...(code === undefined ? {} : { code }) };
  }
}

const outcomes: Outcome[] = [
  await attempt('fs.read', () => readFileSync(outsideFile)),
  await attempt('fs.write', () => writeFileSync(writableFile, 'probe')),
  await attempt('child-process', () => {
    const result = spawnSync(process.execPath, ['-e', '0']);
    if (result.error !== undefined) throw result.error;
  }),
  await attempt('worker', () => new Worker('0', { eval: true }).terminate()),
  await attempt('addon', () => process.dlopen({ exports: {} }, '/kvman-probe/missing.node')),
  await attempt('sqlite.import', () => import('node:sqlite')),
  await attempt('sqlite.require', () => createRequire(import.meta.url)('node:sqlite')),
  await attempt('sqlite.getBuiltinModule', () => process.getBuiltinModule('node:sqlite')),
];

process.stdout.write(JSON.stringify(outcomes));
