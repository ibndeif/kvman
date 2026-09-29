import { createTestKernel, TestkitError, type TestKernel, type TestKernelOptions } from '../../src/index.ts';
import { afterEach, describe, expect, it, vi } from 'vitest';

const kernels: TestKernel[] = [];

afterEach(async () => {
  while (kernels.length > 0) await kernels.pop()?.close();
});

async function started(options: TestKernelOptions): Promise<TestKernel> {
  const kernel = await createTestKernel(options);
  kernels.push(kernel);
  return kernel;
}

describe('catalogs and descriptions (ADRs 0166, 0169)', { timeout: 60_000 }, () => {
  it('M2.13-E22 a key missing from a shipped catalog fails createTestKernel', async () => {
    const half = new URL('./fixtures/extensions/half-catalog/extension.ts', import.meta.url);
    const rejected = await createTestKernel({ extensions: [half] }).then(() => 'started', (error: unknown) => error);
    expect(rejected).toBeInstanceOf(TestkitError);
    expect(String(rejected)).toContain('@acme/half-catalog');
    expect(String(rejected)).toContain('title');
    expect(String(rejected)).toContain('ar');
  });

  it('M2.13-E23 literal text and placeholder descriptions warn without failing', async () => {
    const literal = new URL('./fixtures/extensions/literal/extension.ts', import.meta.url);
    const warned: string[] = [];
    const spy = vi.spyOn(console, 'warn').mockImplementation((...args: unknown[]) => {
      warned.push(args.map((arg) => String(arg)).join(' '));
    });
    try {
      const k = await started({ extensions: [literal] });
      expect(await k.asUser().query('literal.status.get', {})).toEqual({ ok: true });
    } finally {
      spy.mockRestore();
    }
    expect(warned).toHaveLength(2);
    expect(warned.join('\n')).toContain('meta.summary');
    expect(warned.join('\n')).toContain('Plain words');
    expect(warned.join('\n')).toContain('TODO');
  });
});
