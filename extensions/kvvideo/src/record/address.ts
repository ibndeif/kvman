import { invalid } from '../problems.ts';

// The addresses a recording may open (plan 16 §16.5; ADR 0115, 56): any http or https address without credentials,
// in a fresh browser, and never kvman's own (ADR 0107, 18). The recorded page's requests to kvman's port are aborted
// whatever their host, since `0.0.0.0`, `127.0.0.2`, or `[::ffff:127.0.0.1]` reach kvman too.

const localHosts = new Set(['localhost', '127.0.0.1', '[::1]']);

function portOf(url: URL): number {
  if (url.port !== '') return Number(url.port);
  return url.protocol === 'https:' ? 443 : 80;
}

/** Whether a request goes to kvman's port, on any host. */
export function isOwnAddress(url: URL, ownPort: number | null): boolean {
  return ownPort !== null && portOf(url) === ownPort;
}

/** The address, when it is one a recording may open. */
export function recordableAddress(address: string, ownPort: number | null): URL {
  const url = URL.canParse(address) ? new URL(address) : undefined;
  if (url === undefined || (url.protocol !== 'http:' && url.protocol !== 'https:')) throw invalid(`${address} isn't an http or https address.`, { url: address });
  if (url.username !== '' || url.password !== '') throw invalid(`${address} has a user name or password.`, { url: address });
  if (localHosts.has(url.hostname) && isOwnAddress(url, ownPort)) throw invalid(`${address} is kvman's own address, which can't be recorded.`, { url: address });
  return url;
}
