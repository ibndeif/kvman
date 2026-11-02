import type { Page } from 'playwright-core';

// A page is ready to record once its network has been idle for 500 ms, waited for at most 10 s, and all its fonts
// have loaded (plan 16 §16.5). A network that never goes idle doesn't stop the recording; any other failure does.

const idleTimeoutMs = 10_000;

export type ReadyPage = Pick<Page, 'waitForLoadState' | 'evaluate'>;

const isTimeout = (error: unknown): boolean => error instanceof Error && error.name === 'TimeoutError';

export async function waitUntilReady(page: ReadyPage): Promise<void> {
  try {
    await page.waitForLoadState('networkidle', { timeout: idleTimeoutMs });
  } catch (error) {
    if (!isTimeout(error)) throw error;
  }
  await page.evaluate('document.fonts.ready.then(() => true)');
}
