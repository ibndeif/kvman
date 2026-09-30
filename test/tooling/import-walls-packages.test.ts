import { describe, it } from 'vitest';
import { expectBlocked, expectClean } from './repository.ts';

const sdk = 'packages/sdk/src/fixture.ts';
const kernel = 'packages/kernel/src/fixture.ts';

describe('package import walls (plan 01 §1.4)', () => {
  it('M1.1-H2 a file that breaks a wall fails lint', async () => {
    await expectBlocked('imports-kernel.ts', sdk, /packages\/sdk may not import @kvman\/kernel/);
  });

  it('M1.1-E1 the sdk imports zod and no other third-party package', async () => {
    await expectClean('imports-zod.ts', sdk);
    await expectBlocked('imports-marked.ts', sdk, /packages\/sdk may import only zod, not "marked"/);
  });

  it('M1.1-E2 the sdk imports no Node built-in', async () => {
    await expectBlocked('imports-node-fs.ts', sdk, /may not import a Node built-in/);
  });

  it('M1.1-E3 the kernel imports the sdk, its declared dependencies, and Node built-ins', async () => {
    await expectClean('imports-sdk.ts', kernel);
    await expectClean('imports-better-sqlite3.ts', kernel);
    await expectClean('imports-node-fs.ts', kernel);
    await expectBlocked('imports-marked.ts', kernel, /does not declare "marked"/);
    await expectBlocked('imports-bare-fs.ts', kernel, /does not declare "fs"/);
  });

  it('M1.1-E4 the kernel imports no kvman package but the sdk', async () => {
    await expectBlocked('imports-cli.ts', kernel, /may not import kvman/);
    await expectBlocked('imports-testkit.ts', kernel, /may not import @kvman\/testkit/);
    await expectBlocked('imports-notes.ts', kernel, /may not import @kvman\/notes/);
  });

  it('M1.1-E5 the cli and the testkit import the kernel and the sdk, and no third-party package', async () => {
    for (const name of ['cli', 'testkit']) {
      const file = `packages/${name}/src/fixture.ts`;
      await expectClean('imports-kernel.ts', file);
      await expectClean('imports-sdk.ts', file);
      await expectBlocked('imports-marked.ts', file, /may import no third-party package, not "marked"/);
    }
  });

  it('M1.1-E6 a kvman package is imported only through an entry point it exports', async () => {
    await expectClean('imports-sdk-web.ts', kernel);
    await expectBlocked('imports-sdk-internal.ts', kernel, /only through an entry point it exports/);
  });

  it('M1.1-E7 a relative import never leaves its unit', async () => {
    await expectBlocked('imports-relative-outside.ts', sdk, /leaves packages\/sdk/);
    await expectClean('imports-relative-inside.ts', sdk);
  });

  it('M1.1-E8 re-exports and dynamic imports are checked too', async () => {
    for (const fixture of ['reexports-kernel.ts', 'reexports-all-kernel.ts', 'dynamic-import-kernel.ts']) {
      await expectBlocked(fixture, sdk, /packages\/sdk may not import @kvman\/kernel/);
    }
  });

  it('M1.1-E9 a unit without a wall fails', async () => {
    await expectBlocked('imports-sdk.ts', 'packages/unknown/src/fixture.ts', /packages\/unknown has no import wall/);
  });

  it('M1.1-E10 tests may import the test tools, sources may not', async () => {
    await expectBlocked('imports-vitest.ts', kernel, /does not declare "vitest"/);
    await expectClean('imports-vitest.ts', 'packages/kernel/test/fixture.test.ts');
  });
});
