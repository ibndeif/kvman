import { lookup } from 'node:dns/promises';
import http from 'node:http';
import https from 'node:https';
import { isIP, type LookupFunction } from 'node:net';
import { ProblemError } from '@kvman/sdk';
import { invalid } from '../problems.ts';
import { truncate } from '../result-text.ts';
import { isPrivateAddress } from './private-address.ts';

// `web fetch` (plan 08 §8.5, ADR 0095): a page by its address, as Markdown or text. Every host is resolved and checked
// before each request and each redirect, and the connection goes to the address that was checked.

export const bodyLimit = 5 * 1024 * 1024;
const redirectLimit = 5;
const pageTimeoutMs = 30_000;
const textTypes = new Set(['application/json', 'application/xml', 'application/javascript']);

export type PageResponse = { status: number; type: string; location: string | undefined; body: Buffer };

/** How pages are reached: the real network, or what a test puts in its place. */
export type WebTransport = {
  resolve(host: string): Promise<string[]>;
  request(url: URL, address: string, signal: AbortSignal): Promise<PageResponse>;
};

export type WebPage = { url: string; status: number; type: string; content: string };

export const webFailed = (url: string, fields: { status?: number; reason?: string }): ProblemError =>
  new ProblemError({ code: 'kvcoder/WEB_FAILED', message: `${url} couldn't be read: ${fields.status === undefined ? fields.reason ?? 'it failed' : `status ${String(fields.status)}`}.`, params: { url, ...fields } });

// Reads at most the body limit; the rest of a larger body is left unread.
function readBody(response: http.IncomingMessage): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    response.on('data', (chunk: Buffer) => {
      chunks.push(chunk);
      size += chunk.length;
      if (size >= bodyLimit) response.destroy();
    });
    response.on('close', () => resolve(Buffer.concat(chunks).subarray(0, bodyLimit)));
    response.on('error', reject);
  });
}

/** The network: Node's resolver, and a request pinned to the checked address. */
export const networkTransport: WebTransport = {
  resolve: async (host) => (isIP(host) !== 0 ? [host] : (await lookup(host, { all: true, verbatim: true })).map((found) => found.address)),
  request: (url, address, signal) =>
    new Promise((resolve, reject) => {
      const client = url.protocol === 'https:' ? https : http;
      // Every lookup of this request answers the checked address, so a second resolution can't move it.
      const pinned: LookupFunction = (_host, options, done) => {
        if (options.all === true) done(null, [{ address, family: isIP(address) }]);
        else done(null, address, isIP(address));
      };
      const request = client.request(url, { method: 'GET', signal, lookup: pinned, headers: { accept: 'text/html, text/markdown, text/plain, application/json;q=0.9, */*;q=0.1', 'user-agent': 'kvman' } }, (response) => {
        readBody(response).then((body) => resolve({ status: response.statusCode ?? 0, type: String(response.headers['content-type'] ?? ''), location: response.headers.location, body }), reject);
      });
      request.on('error', reject);
      request.end();
    }),
};

// turndown brings a whole DOM, about 14 MB, so a worker loads it with its first page, not at start (plan 12 §12.3).
async function markdownOf(html: string): Promise<string> {
  const { default: TurndownService } = await import('turndown');
  const turndown = new TurndownService({ headingStyle: 'atx', codeBlockStyle: 'fenced' });
  turndown.remove(['script', 'style', 'noscript']);
  return turndown.turndown(html);
}

// A checked address of the host, or a refusal naming it.
async function checkedAddress(transport: WebTransport, url: URL): Promise<string> {
  const host = url.hostname.replace(/^\[|\]$/g, '');
  const addresses = await transport.resolve(host);
  const [first] = addresses;
  if (first === undefined || addresses.some(isPrivateAddress)) throw invalid(`${url.hostname} is a private or local address, which web fetch doesn't reach.`, { url: url.href });
  return first;
}

function parsed(given: string): URL {
  const url = URL.canParse(given) ? new URL(given) : undefined;
  if (url === undefined || (url.protocol !== 'http:' && url.protocol !== 'https:')) throw invalid('The address must start with http:// or https://.', { url: given });
  if (url.username !== '' || url.password !== '') throw invalid("The address can't hold a name or a password.", { url: given });
  return url;
}

async function contentOf(type: string, body: Buffer, url: string): Promise<string> {
  const text = body.toString('utf8');
  if (type === 'text/html' || type === 'application/xhtml+xml') return markdownOf(text);
  if (type.startsWith('text/') || textTypes.has(type) || type.endsWith('+json')) return text;
  throw invalid(`${url} is ${type === '' ? 'of no stated type' : type}, which web fetch doesn't read; only pages and text.`, { url, type });
}

/** Fetches a page, following redirects, each checked again. */
export async function fetchPage(given: string, transport: WebTransport, signal: AbortSignal): Promise<WebPage> {
  let url = parsed(given);
  const timeout = AbortSignal.any([signal, AbortSignal.timeout(pageTimeoutMs)]);
  for (let redirects = 0; ; redirects += 1) {
    const address = await checkedAddress(transport, url);
    let response: PageResponse;
    try {
      response = await transport.request(url, address, timeout);
    } catch (error) {
      signal.throwIfAborted();
      throw webFailed(url.href, { reason: timeout.aborted ? 'it took longer than 30 s' : error instanceof Error ? error.message : 'the connection failed' });
    }
    if (response.status >= 300 && response.status < 400 && response.location !== undefined) {
      if (redirects === redirectLimit) throw webFailed(url.href, { reason: `more than ${String(redirectLimit)} redirects` });
      url = parsed(new URL(response.location, url).href);
      continue;
    }
    if (response.status >= 400) throw webFailed(url.href, { status: response.status });
    const type = (response.type.split(';')[0] ?? '').trim().toLowerCase();
    return { url: url.href, status: response.status, type, content: truncate(await contentOf(type, response.body, url.href)) };
  }
}
