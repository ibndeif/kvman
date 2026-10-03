import { describe, expect, it } from 'vitest';
import { BinFailure } from '../../src/bin/bin-failure.ts';
import { firstPreviewPort, lastPreviewPort, previewPort } from '../../src/preview/preview-port.ts';

// The preview port range (09 §9.3): the first free port from 3738 to 3837, with the real check swapped for an
// injected one so no test opens 100 ports.
describe('previewPort with an injected check (09 §9.3)', () => {
  it('QA17-E13 answers the first port when it is free', async () => {
    await expect(previewPort(async () => true)).resolves.toBe(firstPreviewPort);
  });

  it('QA17-E13 skips taken ports', async () => {
    const taken = new Set([firstPreviewPort, firstPreviewPort + 1]);
    await expect(previewPort(async (port) => !taken.has(port))).resolves.toBe(firstPreviewPort + 2);
  });

  it('QA17-E13 answers 3837 when it is the only free port', async () => {
    await expect(previewPort(async (port) => port === lastPreviewPort)).resolves.toBe(lastPreviewPort);
  });

  it('QA17-E13 fails NO_FREE_PORT when all 100 ports are taken', async () => {
    const failure = await previewPort(async () => false).then(
      () => undefined,
      (error: unknown) => error,
    );
    expect(failure).toBeInstanceOf(BinFailure);
    expect((failure as BinFailure).code).toBe('NO_FREE_PORT');
    expect((failure as BinFailure).message).toBe('Ports 3738 to 3837 are all taken; stop something that listens on one.');
  });
});
