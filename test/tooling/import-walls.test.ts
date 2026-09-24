import { describe, expect, it } from 'vitest';
import { lintFixture, messagesOf } from './repository.ts';

const wallRule = 'kvman/import-walls';

async function wallErrors(fixture: string, virtualPath: string): Promise<string[]> {
  const messages = messagesOf(await lintFixture(fixture, virtualPath), wallRule);
  return messages.map((message) => message.message);
}

async function expectBlocked(fixture: string, virtualPath: string, reason: RegExp): Promise<void> {
  const errors = await wallErrors(fixture, virtualPath);
  expect(errors).toHaveLength(1);
  expect(errors[0]).toMatch(reason);
}

async function expectClean(fixture: string, virtualPath: string): Promise<void> {
  expect(await wallErrors(fixture, virtualPath)).toEqual([]);
}

describe('import walls (plan 01 §1.5)', () => {
  it('M0.1-H2 a fixture that imports across a wall fails lint', async () => {
    await expectBlocked('protocol-imports-sdk.ts', 'packages/protocol/src/fixture.ts', /may not import @kvman\/sdk/);
  });

  it('M0.1-E1 protocol imports only zod among third-party packages', async () => {
    await expectBlocked('imports-third-party.ts', 'packages/protocol/src/fixture.ts', /may import only zod/);
    await expectClean('imports-zod.ts', 'packages/protocol/src/fixture.ts');
  });

  it('M0.1-E2 protocol may not import a Node built-in', async () => {
    await expectBlocked('imports-node-builtin.ts', 'packages/protocol/src/fixture.ts', /has no I\/O/);
  });

  it('M0.1-E3 sdk may import protocol but not the kernel', async () => {
    await expectBlocked('imports-kernel.ts', 'packages/sdk/src/fixture.ts', /may not import @kvman\/kernel/);
    await expectClean('imports-protocol.ts', 'packages/sdk/src/fixture.ts');
  });

  it('M0.1-E4 kernel imports sdk for types only', async () => {
    await expectBlocked('protocol-imports-sdk.ts', 'packages/kernel/src/fixture.ts', /for types only/);
    await expectClean('imports-sdk-types.ts', 'packages/kernel/src/fixture.ts');
  });

  it('M0.1-E5 kernel never imports devtools', async () => {
    await expectBlocked('imports-devtools.ts', 'packages/kernel/src/fixture.ts', /may not import @kvman\/devtools/);
  });

  it('M0.1-E6 testkit may import kernel, sdk, and protocol but not the shell', async () => {
    await expectBlocked('imports-shell.ts', 'packages/testkit/src/fixture.ts', /may not import @kvman\/shell/);
    await expectClean('imports-kernel.ts', 'packages/testkit/src/fixture.ts');
    await expectClean('protocol-imports-sdk.ts', 'packages/testkit/src/fixture.ts');
    await expectClean('imports-protocol.ts', 'packages/testkit/src/fixture.ts');
  });

  it('M0.1-E7 shell, widget-bridge, and cli import only protocol', async () => {
    for (const name of ['shell', 'widget-bridge', 'cli']) {
      await expectBlocked('protocol-imports-sdk.ts', `packages/${name}/src/fixture.ts`, /may not import @kvman\/sdk/);
      await expectClean('imports-protocol.ts', `packages/${name}/src/fixture.ts`);
    }
  });

  it('M0.1-E8 devtools may import testkit and protocol but not the kernel', async () => {
    await expectBlocked('imports-kernel.ts', 'packages/devtools/src/fixture.ts', /may not import @kvman\/kernel/);
    await expectClean('imports-testkit.ts', 'packages/devtools/src/fixture.ts');
    await expectClean('imports-protocol.ts', 'packages/devtools/src/fixture.ts');
  });

  it('M0.1-E9 an extension never imports the kernel, the shell, or another extension', async () => {
    await expectBlocked('imports-kernel.ts', 'extensions/todo/src/fixture.ts', /may not import @kvman\/kernel/);
    await expectBlocked('imports-shell.ts', 'extensions/todo/src/fixture.ts', /may not import @kvman\/shell/);
    await expectBlocked('imports-other-extension.ts', 'extensions/todo/src/fixture.ts', /may not import @kvman\/agent/);
    await expectClean('protocol-imports-sdk.ts', 'extensions/todo/src/fixture.ts');
    await expectClean('imports-protocol.ts', 'extensions/todo/src/fixture.ts');
  });

  it('M0.1-E10 an extension imports the testkit only from its tests', async () => {
    await expectBlocked('imports-testkit.ts', 'extensions/todo/src/fixture.ts', /may not import @kvman\/testkit/);
    await expectClean('imports-testkit.ts', 'extensions/todo/test/fixture.test.ts');
  });

  it('M0.1-E11 an example never imports the kernel', async () => {
    await expectBlocked('imports-kernel.ts', 'examples/pdf-translator/src/fixture.ts', /may not import @kvman\/kernel/);
  });

  it('M0.1-E12 packages are imported only through their public entry point', async () => {
    await expectBlocked('imports-protocol-subpath.ts', 'packages/sdk/src/fixture.ts', /only through its public entry point/);
  });

  it('M0.1-E13 a relative import never leaves its package', async () => {
    await expectBlocked('imports-relative-outside.ts', 'packages/sdk/src/fixture.ts', /leaves packages\/sdk/);
    await expectClean('imports-relative-inside.ts', 'packages/sdk/src/fixture.ts');
  });

  it('M0.1-E14 re-exports and dynamic imports cross no wall either', async () => {
    await expectBlocked('reexports-kernel.ts', 'packages/sdk/src/fixture.ts', /may not import @kvman\/kernel/);
    await expectBlocked('reexports-all-kernel.ts', 'packages/sdk/src/fixture.ts', /may not import @kvman\/kernel/);
    await expectBlocked('dynamic-import-kernel.ts', 'packages/sdk/src/fixture.ts', /may not import @kvman\/kernel/);
  });

  it('M0.2-E40 protocol tests may import the test tools, protocol sources may not', async () => {
    await expectClean('imports-vitest.ts', 'packages/protocol/test/fixture.test.ts');
    await expectBlocked('imports-vitest.ts', 'packages/protocol/src/fixture.ts', /may import only zod/);
  });
  it('M1.3-E24 tests may import JSON fixtures of other packages, never their code; sources may import neither', async () => {
    await expectClean('imports-other-package-fixture.ts', 'packages/testkit/test/recording/fixture.test.ts');
    await expectBlocked('imports-other-package-test-helper.ts', 'packages/testkit/test/recording/fixture.test.ts', /leaves packages\/testkit/);
    await expectBlocked('imports-other-package-fixture.ts', 'packages/testkit/src/recording/fixture.ts', /leaves packages\/testkit/);
  });
});
