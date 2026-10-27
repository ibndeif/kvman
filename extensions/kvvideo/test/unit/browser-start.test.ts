import { describe, expect, it } from 'vitest';
import { ProblemError } from '@kvman/sdk';
import { startBrowser } from '../../src/browser/start-browser.ts';

describe('starting the browser for a recording (16 §16.5)', () => {
  it('M5.2-E8 no channel starts: kvvideo/BROWSER_MISSING with the channels tried', async () => {
    const failure = await startBrowser('auto', async (channel) => {
      throw new Error(`${channel} isn't installed\nmore lines`);
    }).then(
      () => undefined,
      (error: unknown) => error,
    );
    expect(failure instanceof ProblemError ? failure.problem : failure).toMatchObject({ code: 'kvvideo/BROWSER_MISSING', params: { channels: ['chrome', 'msedge'] } });
  });

  it('M5.2-E8 the first channel that starts is used', async () => {
    expect(await startBrowser('auto', async (channel) => (channel === 'msedge' ? 'edge' : Promise.reject(new Error('no'))))).toBe('edge');
  });
});
