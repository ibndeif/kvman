import { describe, expect, it } from 'vitest';
import type { Channel } from '../../src/browser/channels.ts';
import { browserReadiness } from '../../src/setup/browser-readiness.ts';

function launcher(starting: readonly Channel[]) {
  const tried: Channel[] = [];
  const closed: Channel[] = [];
  const launch = async (channel: Channel) => {
    tried.push(channel);
    if (!starting.includes(channel)) throw new Error(`${channel} isn't installed`);
    return { close: async () => void closed.push(channel) };
  };
  return { launch, tried, closed };
}

describe('the browser part of check (16 §16.4)', () => {
  it('M5.1-E4 auto tries Chrome then Edge, and a started browser is closed', async () => {
    const none = launcher([]);
    expect(await browserReadiness('auto', none.launch)).toEqual({ ready: false, channel: null });
    expect(none.tried).toEqual(['chrome', 'msedge']);
    const edge = launcher(['msedge']);
    expect(await browserReadiness('auto', edge.launch)).toEqual({ ready: true, channel: 'msedge' });
    expect(edge.closed).toEqual(['msedge']);
  });

  it('M5.1-E4 a named browser is the only one tried', async () => {
    const chrome = launcher(['msedge']);
    expect(await browserReadiness('chrome', chrome.launch)).toEqual({ ready: false, channel: null });
    expect(chrome.tried).toEqual(['chrome']);
    const edge = launcher(['msedge']);
    expect(await browserReadiness('msedge', edge.launch)).toEqual({ ready: true, channel: 'msedge' });
    expect(edge.tried).toEqual(['msedge']);
  });
});
