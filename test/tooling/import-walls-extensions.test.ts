import { describe, it } from 'vitest';
import { expectBlocked, expectClean } from './repository.ts';

const notes = 'extensions/notes/src/fixture.ts';
const notesTest = 'extensions/notes/test/fixture.test.ts';
const connector = 'extensions/tasks/src/connector.ts';

describe('extension import walls (plan 01 §1.4, 03 §3.2)', () => {
  it('M1.1-E11 an extension imports the sdk, its declared dependencies, and Node built-ins', async () => {
    await expectClean('imports-sdk.ts', notes);
    await expectClean('imports-marked.ts', notes);
    await expectClean('imports-node-child-process.ts', notes);
    await expectBlocked('imports-left-pad.ts', notes, /does not declare "left-pad"/);
  });

  it('M1.1-E12 an extension never imports the kernel or the cli', async () => {
    await expectBlocked('imports-kernel.ts', notes, /extensions\/notes may not import @kvman\/kernel/);
    await expectBlocked('imports-cli.ts', notes, /extensions\/notes may not import kvman/);
  });

  it('M1.1-E13 an extension imports the testkit and its devDependencies only from tests', async () => {
    await expectBlocked('imports-testkit.ts', notes, /may not import @kvman\/testkit/);
    await expectBlocked('imports-fast-check.ts', notes, /does not declare "fast-check"/);
    await expectClean('imports-testkit.ts', notesTest);
    await expectClean('imports-fast-check.ts', notesTest);
  });

  it('M1.1-E14 another extension is type-imported only when it is a kvman.dependencies entry', async () => {
    await expectClean('type-imports-tasks.ts', notes);
    await expectBlocked('imports-tasks.ts', notes, /at runtime only through a subpath it exports/);
    await expectBlocked('type-imports-other.ts', notes, /only when it is a kvman\.dependencies entry/);
  });

  it('M1.1-E15 a runtime import of another extension is an exported subpath of a dependency', async () => {
    await expectClean('imports-tasks-connector.ts', notes);
    await expectBlocked('imports-tasks-internal.ts', notes, /only through an entry point it exports/);
    await expectBlocked('imports-other-helper.ts', notes, /only when it is a kvman\.dependencies entry/);
  });

  it('M1.1-E16 an exported subpath imports only the sdk', async () => {
    await expectClean('imports-sdk.ts', connector);
    await expectClean('imports-relative-types.ts', connector);
    await expectBlocked('imports-zod.ts', connector, /an exported subpath imports only @kvman\/sdk/);
    await expectBlocked('imports-node-fs.ts', connector, /an exported subpath imports only @kvman\/sdk/);
    await expectBlocked('imports-relative-state.ts', connector, /an exported subpath imports only @kvman\/sdk/);
  });
});
