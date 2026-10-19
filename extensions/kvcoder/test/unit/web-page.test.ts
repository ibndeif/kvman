import { isIP } from 'node:net';
import { describe, expect, it } from 'vitest';
import { bodyLimit, fetchPage, type PageResponse, type WebTransport } from '../../src/web/fetch-page.ts';
import { isPrivateAddress } from '../../src/web/private-address.ts';

// web fetch's reading of a page (08 §8.5, ADR 0095), with the network replaced by a table of answers. An address is
// its own resolution, as with the network.
type Answer = Partial<PageResponse> & { body?: Buffer };
function transport(hosts: Record<string, string[]>, pages: Record<string, Answer>) {
  const requested: string[] = [];
  const used: WebTransport = {
    resolve: (host) => Promise.resolve(isIP(host) !== 0 ? [host] : (hosts[host] ?? [])),
    request: (url) => {
      requested.push(url.href);
      const answer = pages[url.href] ?? { status: 404 };
      return Promise.resolve({ status: answer.status ?? 200, type: answer.type ?? 'text/html', location: answer.location, body: answer.body ?? Buffer.alloc(0) });
    },
  };
  return { used, requested };
}
const live = new AbortController().signal;
const publicHost = { 'docs.example.test': ['93.184.216.34'] };
const html = (body: string): Buffer => Buffer.from(`<html><head><style>p{}</style><script>alert(1)</script></head><body>${body}</body></html>`);

describe('web fetch reads a page (ADR 0095)', () => {
  it('QA63-H1 a page reads as Markdown without its scripts and styles', async () => {
    const { used } = transport(publicHost, { 'https://docs.example.test/a': { body: html('<h1>Install</h1><p>See <a href="https://x.test/">the guide</a>.</p><pre><code>pnpm add x</code></pre><noscript>Turn on scripts</noscript>') } });
    const page = await fetchPage('https://docs.example.test/a', used, live);
    expect(page).toMatchObject({ url: 'https://docs.example.test/a', status: 200, type: 'text/html' });
    expect(page.content).toContain('# Install');
    expect(page.content).toContain('[the guide](https://x.test/)');
    expect(page.content).toContain('```\npnpm add x\n```');
    for (const hidden of ['alert', 'p{}', 'Turn on scripts']) expect(page.content).not.toContain(hidden);
  });

  it('QA63-H2 text types read as sent, and redirects are followed to the last address', async () => {
    const { used } = transport(publicHost, {
      'https://docs.example.test/old': { status: 301, location: '/middle' },
      'https://docs.example.test/middle': { status: 302, location: 'https://docs.example.test/new' },
      'https://docs.example.test/new': { type: 'text/plain; charset=utf-8', body: Buffer.from('plain words') },
      'https://docs.example.test/data': { type: 'application/json', body: Buffer.from('{"a":1}') },
    });
    expect(await fetchPage('https://docs.example.test/old', used, live)).toEqual({ url: 'https://docs.example.test/new', status: 200, type: 'text/plain', content: 'plain words' });
    expect((await fetchPage('https://docs.example.test/data', used, live)).content).toBe('{"a":1}');
  });

  it('QA63-E1 private and local addresses are refused, also after a redirect, and never requested', async () => {
    for (const address of ['127.0.0.1', '10.0.0.5', '172.20.1.1', '192.168.1.1', '169.254.169.254', '0.0.0.0', '100.64.0.1', '224.0.0.1', '::1', '::', 'fc00::1', 'fe80::1', 'fe80::1%eth0', 'fec0::1', 'ff02::1', '::ffff:127.0.0.1', '::ffff:7f00:1', '0:0:0:0:0:ffff:7f00:0001', '::ffff:a9fe:a9fe', '::7f00:1', '64:ff9b::a00:5', '64:ff9b:1::8.8.8.8', '2002:c0a8:101::1', 'not-an-address']) expect(isPrivateAddress(address), address).toBe(true);
    for (const address of ['93.184.216.34', '8.8.8.8', '2606:4700::1111', '::ffff:8.8.8.8', '::ffff:808:808', '64:ff9b::808:808', '2002:808:808::1']) expect(isPrivateAddress(address), address).toBe(false);
    // The URL parser writes IPv4 inside IPv6 as hex (`[::ffff:7f00:1]`), and that form is refused too.
    for (const url of ['http://[::ffff:127.0.0.1]/', 'http://[::ffff:a9fe:a9fe]/', 'http://[64:ff9b::127.0.0.1]/', 'http://[2002:7f00:1::]/', 'http://[0:0:0:0:0:ffff:7f00:0001]/']) await expect(fetchPage(url, transport({}, {}).used, live), url).rejects.toMatchObject({ problem: { code: 'VALIDATION_FAILED' } });
    const { used, requested } = transport({ ...publicHost, 'inside.example.test': ['10.0.0.5'] }, { 'https://docs.example.test/jump': { status: 302, location: 'https://inside.example.test/secret' } });
    for (const url of ['http://127.0.0.1:3737/api', 'http://[::1]/', 'https://inside.example.test/', 'https://docs.example.test/jump']) await expect(fetchPage(url, used, live), url).rejects.toMatchObject({ problem: { code: 'VALIDATION_FAILED' } });
    expect(requested).toEqual(['https://docs.example.test/jump']);
  });

  it('QA63-E2 bad addresses, other types, failing statuses, and too many redirects', async () => {
    const loop = Object.fromEntries(Array.from({ length: 7 }, (_hop, index) => [`https://docs.example.test/${String(index)}`, { status: 302, location: `/${String(index + 1)}` }]));
    const { used } = transport(publicHost, { ...loop, 'https://docs.example.test/logo': { type: 'image/png', body: Buffer.from([1, 2]) } });
    await expect(fetchPage('ftp://docs.example.test/a', used, live)).rejects.toMatchObject({ problem: { code: 'VALIDATION_FAILED' } });
    await expect(fetchPage('https://me:secret@docs.example.test/a', used, live)).rejects.toMatchObject({ problem: { code: 'VALIDATION_FAILED' } });
    await expect(fetchPage('https://docs.example.test/logo', used, live)).rejects.toMatchObject({ problem: { code: 'VALIDATION_FAILED' } });
    await expect(fetchPage('https://docs.example.test/missing', used, live)).rejects.toMatchObject({ problem: { code: 'kvcoder/WEB_FAILED', params: { status: 404 } } });
    await expect(fetchPage('https://docs.example.test/0', used, live)).rejects.toMatchObject({ problem: { code: 'kvcoder/WEB_FAILED', params: { reason: 'more than 5 redirects' } } });
  });

  it('QA63-E3 a long page is cut to its first and last 15 KB', async () => {
    const { used } = transport(publicHost, { 'https://docs.example.test/long': { type: 'text/plain', body: Buffer.from(`start${'x'.repeat(60_000)}end`) } });
    const page = await fetchPage('https://docs.example.test/long', used, live);
    expect(page.content.startsWith('start')).toBe(true);
    expect(page.content.endsWith('end')).toBe(true);
    expect(page.content).toMatch(/\[… \d+ bytes omitted …\]/);
    expect(bodyLimit).toBe(5 * 1024 * 1024);
  });
});
