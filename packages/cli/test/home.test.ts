import { mkdirSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { daemonTests, kvman, temporaryFolder } from './cli.ts';

const started: string[] = [];

afterEach(async () => {
  for (const home of started.splice(0)) await kvman(['stop', '--home', home]);
});

async function statusHome(args: readonly string[], env: NodeJS.ProcessEnv, cwd?: string): Promise<unknown> {
  const run = await kvman(['status', ...args], { env, ...(cwd === undefined ? {} : { cwd }) });
  expect(run.code).toBe(0);
  const health: unknown = JSON.parse(run.stdout);
  return typeof health === 'object' && health !== null && 'home' in health ? health.home : undefined;
}

describe('the home folder of every command (plan 12 §12.5, R-Q4)', daemonTests, () => {
  it('M1.8-E6 the home is --home, else KVMAN_HOME, else ~/.kvman', async () => {
    const flagHome = join(temporaryFolder(), 'x');
    const environmentHome = join(temporaryFolder(), 'y');
    const userHome = temporaryFolder();
    mkdirSync(userHome, { recursive: true });
    const defaultHome = join(userHome, '.kvman');
    for (const home of [flagHome, environmentHome, defaultHome]) {
      started.push(home);
      expect((await kvman(['start', '--home', home])).code).toBe(0);
    }
    expect(await statusHome(['--home', flagHome], { KVMAN_HOME: environmentHome })).toBe(flagHome);
    expect(await statusHome([], { KVMAN_HOME: environmentHome })).toBe(environmentHome);
    expect(await statusHome([], { HOME: userHome })).toBe(defaultHome);
    expect(await statusHome(['--home', basename(flagHome)], {}, dirname(flagHome))).toBe(flagHome);
  });
});
