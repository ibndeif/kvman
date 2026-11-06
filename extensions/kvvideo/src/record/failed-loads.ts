import type { BrowserContext } from 'playwright-core';
import { isOwnAddress } from './address.ts';

// Failed loads (plan 16 §16.5; ADR 0120, 7 and 20): the requests of a website or a page that got an HTTP status of 400
// or more, or failed (status 0), in the order they ended, each address once, at most 20. kvman's own address, which a
// recording aborts on purpose, is left out.

export type FailedLoad = { url: string; status: number };

const kept = 20;

export type FailedLoads = { add(url: string, status: number): void; list(): FailedLoad[] };

/** A list of failed loads, leaving out kvman's own port. */
export function failedLoads(ownPort: number | null): FailedLoads {
  const found: FailedLoad[] = [];
  return {
    add: (url, status) => {
      if (found.length >= kept || (URL.canParse(url) && isOwnAddress(new URL(url), ownPort)) || found.some((load) => load.url === url)) return;
      found.push({ url, status });
    },
    list: () => [...found],
  };
}

/** Listens to a browser context's responses and failed requests. */
export function watchLoads(context: BrowserContext, loads: FailedLoads): void {
  context.on('response', (response) => {
    if (response.status() >= 400) loads.add(response.url(), response.status());
  });
  context.on('requestfailed', (request) => loads.add(request.url(), 0));
}
