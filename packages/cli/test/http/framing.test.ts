import { describe, expect, it } from 'vitest';
import { z } from '@kvman/sdk';
import { api } from '../support/api.ts';
import { startKvman } from '../support/kvman-child.ts';
import { useSandbox } from '../support/sandbox.ts';

const sandbox = useSandbox();

const policy = "frame-ancestors 'self' http://127.0.0.1:* http://localhost:* vscode-webview: vscode-file:";
const fileAnswer = z.object({ ok: z.literal(true), file: z.object({ id: z.string() }) });

describe('the framing policy (04 §4.2, ADR 0099, 9 and 32)', { timeout: 60_000 }, () => {
  it('M4.1-H1 every answer carries the framing policy: JSON, a page, a static file, a download, a 404, and FORBIDDEN_ORIGIN', async () => {
    const world = sandbox();
    const kvman = await startKvman(world, ['--preset', world.appPreset()]);
    const calls = api(kvman.port);
    const stored = await calls.fetch('/api/files?workspaceId=home&name=a.txt', { method: 'POST', headers: { 'content-type': 'text/plain' }, body: 'text' });
    const fileId = fileAnswer.parse(await stored.json()).file.id;
    expect(stored.headers.get('content-security-policy')).toBe(policy);
    for (const route of ['/api/locales/en', '/', '/web/app/nested/page.js', `/api/files/${fileId}?workspaceId=home`, '/web/app/missing.js', '/api/unknown']) {
      const response = await calls.fetch(route);
      expect(response.headers.get('content-security-policy'), route).toBe(policy);
    }
    expect((await calls.fetch('/web/app/missing.js')).status).toBe(404);
    const refused = await calls.raw('/api/locales/en', { host: 'evil.com' });
    expect(refused.body).toContain('FORBIDDEN_ORIGIN');
    expect(refused.headers['content-security-policy']).toBe(policy);
  });

  it('M4.1-E5 the policy names no https: or wildcard source, so a website is never an allowed ancestor', () => {
    const sources = policy.split(' ').slice(1);
    expect(sources.filter((source) => source.startsWith('https:') || source === '*' || source === 'http:')).toEqual([]);
    expect(sources.every((source) => source === "'self'" || source.startsWith('http://127.0.0.1:') || source.startsWith('http://localhost:') || source.startsWith('vscode-'))).toBe(true);
  });
});
