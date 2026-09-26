import { existsSync } from 'node:fs';
import { defaultNpmRegistry, gitCommands, hostPlatform, npmRegistryFrom, pnpmExecutable } from '../../src/index.ts';
import { describe, expect, it } from 'vitest';
import { failure } from './trees.ts';

const safety = ['-c', 'protocol.ext.allow=never', '-c', 'protocol.file.allow=user'];

describe('the bundled tools (plan 06 §6.1–§6.2, 12 §12.5, ADRs 0113, 0116)', () => {
  it('M2.2-E23 every git command refuses the ext and file transports, and the clone ends its options before the URL', () => {
    const commands = gitCommands('git://host/repo.git', 'a'.repeat(40), '/work/checkout');
    for (const args of Object.values(commands)) expect(args.slice(0, 4)).toEqual(safety);
    expect(commands.clone.slice(-3)).toEqual(['--', 'git://host/repo.git', '/work/checkout']);
  });

  it('M2.2-E24 the pnpm executable comes from its platform package, and a missing one is named', async () => {
    const executable = pnpmExecutable(hostPlatform());
    expect(executable).toMatch(/@pnpm\/exe\.[a-z0-9-]+\/pnpm(\.exe)?$/);
    expect(existsSync(executable)).toBe(true);
    const aix = failure(Promise.resolve().then(() => pnpmExecutable({ platform: 'aix', arch: 'ppc64', musl: false })));
    expect(await aix).toMatchObject({ code: 'EXT_SOURCE_INVALID', details: { params: { package: '@pnpm/exe.aix-ppc64' } } });
  });

  it('M2.2-E25 KVMAN_NPM_REGISTRY names the registry, and npm is the default', () => {
    expect(npmRegistryFrom({ KVMAN_NPM_REGISTRY: 'http://127.0.0.1:4873/' })).toBe('http://127.0.0.1:4873/');
    expect(npmRegistryFrom({})).toBe(defaultNpmRegistry);
    expect(defaultNpmRegistry).toBe('https://registry.npmjs.org/');
  });
});
