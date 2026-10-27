import { invalid } from '../problems.ts';

// The addresses a recording may open (plan 16 §16.5, ADR 0107, 18): http or https on this computer, without
// credentials, and never kvman's own.

const localHosts = new Set(['localhost', '127.0.0.1', '[::1]']);

function portOf(url: URL): number {
  if (url.port !== '') return Number(url.port);
  return url.protocol === 'https:' ? 443 : 80;
}

/** Whether an address is kvman's own: a local host on kvman's port. */
export function isOwnAddress(url: URL, ownPort: number | null): boolean {
  return ownPort !== null && localHosts.has(url.hostname) && portOf(url) === ownPort;
}

/** The address, when it is one a recording may open. */
export function localAddress(address: string, ownPort: number | null): URL {
  const url = URL.canParse(address) ? new URL(address) : undefined;
  if (url === undefined || (url.protocol !== 'http:' && url.protocol !== 'https:')) throw invalid(`${address} isn't an http or https address.`, { url: address });
  if (!localHosts.has(url.hostname)) throw invalid(`${address} isn't on this computer: use localhost, 127.0.0.1, or [::1].`, { url: address });
  if (url.username !== '' || url.password !== '') throw invalid(`${address} has a user name or password.`, { url: address });
  if (isOwnAddress(url, ownPort)) throw invalid(`${address} is kvman's own address, which can't be recorded.`, { url: address });
  return url;
}
