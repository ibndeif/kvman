import { describe, expect, it } from 'vitest';
import { waitUntilReady, type ReadyPage } from '../../src/record/page-ready.ts';

function pageThat(idle: () => Promise<void>, calls: string[]): ReadyPage {
  return {
    waitForLoadState: async (state, options) => {
      calls.push(`${String(state)} ${String(options?.timeout)}`);
      await idle();
    },
    evaluate: async (expression: unknown) => {
      calls.push(String(expression));
      return true;
    },
  } as ReadyPage;
}

const timeout = (): Error => Object.assign(new Error('Timeout 10000ms exceeded.'), { name: 'TimeoutError' });

describe('a page is ready to record (16 §16.5)', () => {
  it('M5.5-E11 a network that never goes idle goes on after 10 s; fonts are still awaited', async () => {
    const calls: string[] = [];
    await waitUntilReady(pageThat(() => Promise.reject(timeout()), calls));
    expect(calls).toEqual(['networkidle 10000', 'document.fonts.ready.then(() => true)']);
  });

  it('M5.5-E11 another failure is thrown', async () => {
    await expect(waitUntilReady(pageThat(() => Promise.reject(new Error('Target page, context or browser has been closed')), []))).rejects.toThrow('has been closed');
  });
});
