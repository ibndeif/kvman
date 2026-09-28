import { problemSchema, uiPageAnswerSchema, uiRegistrySchema, uiTranslationsAnswerSchema } from '@kvman/protocol';
import { afterEach, describe, expect, it } from 'vitest';
import { send } from '../adapters/http-client.ts';
import { workspaceA } from '../hosts/harness.ts';
import { openFolderAsWorkspace, temporaryFolder } from '../workspaces/harness.ts';
import { boardFixture, locale, registry } from './registry-harness.ts';
import { openUiHttp } from './registry-http.ts';
import { uiTests, type UiFixture } from './harness.ts';

let fixture: UiFixture | undefined;
let http: Awaited<ReturnType<typeof openUiHttp>> | undefined;
afterEach(async () => { await http?.close(); http = undefined; await fixture?.close(); fixture = undefined; });

describe('HTTP UI routes', uiTests, () => {
  it('M2.11-E31 serves the registry with a strong tag and accepts weak, list, and wildcard conditions', async () => {
    fixture = await boardFixture();
    http = await openUiHttp(fixture);
    const path = `/api/v1/ui?workspaceId=${workspaceA}`;
    const first = await send(http.port, 'GET', path);
    expect(first.status).toBe(200);
    const current = uiRegistrySchema.parse(first.json);
    const tag = `"${current.revision}"`;
    expect(first.headers.etag).toBe(tag);
    for (const candidate of [tag, `W/${tag}`, `"other", ${tag}`, '*']) {
      const cached = await send(http.port, 'GET', path, { headers: { 'if-none-match': candidate } });
      expect(cached.status).toBe(304);
      expect(cached.text).toBe('');
      expect(cached.headers.etag).toBe(tag);
    }
    const other = await send(http.port, 'GET', path, { headers: { 'if-none-match': '"other"' } });
    expect(other.status).toBe(200);
    expect(uiRegistrySchema.parse(other.json)).toEqual(current);
  });

  it('M2.11-E32 tags pages by revision and translations by revision plus saved locale', async () => {
    fixture = await boardFixture();
    http = await openUiHttp(fixture);
    const revision = (await registry(fixture)).revision;
    const pagePath = `/api/v1/ui/pages/board.home?workspaceId=${workspaceA}`;
    const translationsPath = `/api/v1/ui/translations?workspaceId=${workspaceA}`;
    const page = await send(http.port, 'GET', pagePath);
    expect(page.status).toBe(200);
    expect(page.headers.etag).toBe(`"${revision}"`);
    expect(uiPageAnswerSchema.parse(page.json).page.route).toBe('/board');
    const catalog = await send(http.port, 'GET', translationsPath);
    expect(catalog.status).toBe(200);
    expect(catalog.headers.etag).toBe(`"${revision}:en"`);
    expect(uiTranslationsAnswerSchema.parse(catalog.json).locale).toBe('en');
    const tagged: Array<[string, string]> = [[pagePath, `"${revision}"`], [translationsPath, `"${revision}:en"`]];
    for (const [path, tag] of tagged) {
      const cached = await send(http.port, 'GET', path, { headers: { 'if-none-match': tag } });
      expect(cached.status).toBe(304);
      expect(cached.text).toBe('');
    }
    await locale(fixture, 'ar');
    const changed = await send(http.port, 'GET', translationsPath, { headers: { 'if-none-match': `"${revision}:en"` } });
    expect(changed.status).toBe(200);
    expect(changed.headers.etag).toBe(`"${revision}:ar"`);
    expect(uiTranslationsAnswerSchema.parse(changed.json).locale).toBe('ar');
    expect((await send(http.port, 'GET', `/api/v1/ui?workspaceId=${workspaceA}`, { headers: { 'if-none-match': `"${revision}"` } })).status).toBe(304);
  });

  it('M2.11-E33 maps absent workspace, missing preset, and unknown page to their HTTP problems', async () => {
    fixture = await boardFixture();
    const workspaceC = await openFolderAsWorkspace(fixture, temporaryFolder('board-http-c'));
    http = await openUiHttp(fixture);
    for (const [path, status, code] of [
      ['/api/v1/ui', 400, 'VALIDATION_FAILED'],
      [`/api/v1/ui?workspaceId=${workspaceC}`, 422, 'PRESET_REQUIRED'],
      [`/api/v1/ui/pages/board.missing?workspaceId=${workspaceA}`, 404, 'NOT_FOUND'],
    ] as const) {
      const result = await send(http.port, 'GET', path);
      expect(result.status).toBe(status);
      expect(problemSchema.parse(result.json).code).toBe(code);
    }
  });
});
