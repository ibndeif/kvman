// The address a `url` artifact may frame (plan 08 §8.7, ADR 0009, 216): an http or https page on `localhost` or
// `127.0.0.1`, with no credentials, and never kvman itself, whose address the page knows (`own`).

export type OwnAddress = { protocol: string; port: string };

const localHosts = new Set(['localhost', '127.0.0.1']);
const defaultPorts: Record<string, string> = { 'http:': '80', 'https:': '443' };

const portOf = (url: { protocol: string; port: string }): string => (url.port === '' ? (defaultPorts[url.protocol] ?? '') : url.port);

/** The address to frame, or `undefined` when it isn't a local page other than kvman's own. */
export function frameableUrl(content: string, own: OwnAddress): string | undefined {
  const text = content.trim();
  if (text === '' || /\s/.test(text) || !URL.canParse(text)) return undefined;
  const url = new URL(text);
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return undefined;
  if (!localHosts.has(url.hostname) || url.username !== '' || url.password !== '') return undefined;
  return portOf(url) === portOf(own) ? undefined : url.href;
}
