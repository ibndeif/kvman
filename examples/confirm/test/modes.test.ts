import { extensionGetResultSchema } from '@kvman/protocol';
import { createTestKernel, type TestKernel } from '@kvman/testkit';
import { afterEach, describe, expect, it } from 'vitest';

const extension = new URL('../src/extension.ts', import.meta.url);

let k: TestKernel | undefined;

afterEach(async () => {
  await k?.close();
  k = undefined;
});

async function installed(kernel: TestKernel): Promise<{ source: string | undefined; isolation: string | undefined }> {
  const got = extensionGetResultSchema.parse(await kernel.asUser().query('kernel.extension.get', { name: '@kvman/example-confirm' }));
  return { source: got.versions[0]?.source, isolation: got.grants[kernel.workspaceId]?.isolation };
}

describe('the sample prompt extension in both modes (ADR 0165)', { timeout: 60_000 }, () => {
  it('M2.13-H2 runs shared as a builtin and sandboxed as a local extension', async () => {
    k = await createTestKernel({ extensions: [extension], isolation: 'shared' });
    expect(await installed(k)).toEqual({ source: 'builtin:@kvman/example-confirm', isolation: 'shared' });
    await k.close();

    k = await createTestKernel({ extensions: [extension], isolation: 'sandboxed' });
    const sandboxed = await installed(k);
    expect(sandboxed.isolation).toBe('sandboxed');
    expect(sandboxed.source).toMatch(/^local:[0-9a-f]{64}$/);
  });
});
