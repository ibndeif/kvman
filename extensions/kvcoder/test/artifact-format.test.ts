import { describe, expect, it } from 'vitest';
import { useKvcoder } from './support/kvcoder-kernel.ts';
import { calls, says, toolResults } from './support/model-script.ts';
import { newSession } from './support/turns.ts';

const kvcoder = useKvcoder();

async function written(...commands: string[]) {
  const { kernel, fake } = await kvcoder.start();
  const sessionId = await newSession(kernel);
  fake.reply(calls(...commands), says('ok'));
  await kernel.exec('kvcoder.message.send', { sessionId, text: 'go' });
  await kernel.clock.advance(0);
  const get = (id: string) => kernel.exec('kvcoder.artifact.get', { sessionId, id });
  return { kernel, sessionId, results: toolResults(fake), get };
}

const body = (json: string, text: string): string => `artifact write '${json}' <<'EOF'\n${text}\nEOF`;

describe("an artifact's format (08 §8.5, ADR 0009, 215 and 216)", { timeout: 30_000 }, () => {
  it('QA12-H1 a page written without a format is stored as html, and an explicit format is kept', async () => {
    const { get } = await written(
      body('{"id":"a1","title":"A"}', '<!DOCTYPE html>\n<html></html>'),
      body('{"id":"a2","title":"A"}', '  <html lang="ar">\n</html>'),
      body('{"id":"a3","title":"A","format":"markdown"}', '<!DOCTYPE html>\n<html></html>'),
    );
    expect((await get('a1')).format).toBe('html');
    expect((await get('a2')).format).toBe('html');
    expect((await get('a3')).format).toBe('markdown');
  });

  it('QA12-H2 a lone local address written without a format is a url artifact, and a sentence with one stays markdown', async () => {
    const { get } = await written(
      `artifact write '{"id":"u1","title":"U","content":"http://localhost:8080/"}'`,
      `artifact write '{"id":"u2","title":"U","content":"https://127.0.0.1:5173/app?x=1"}'`,
      `artifact write '{"id":"m1","title":"M","content":"see http://localhost:8080 for it"}'`,
    );
    expect(await get('u1')).toMatchObject({ format: 'url', content: 'http://localhost:8080/' });
    expect(await get('u2')).toMatchObject({ format: 'url', content: 'https://127.0.0.1:5173/app?x=1' });
    expect((await get('m1')).format).toBe('markdown');
  });

  it('QA12-H3 a url artifact is stored trimmed and listed as url', async () => {
    const { kernel, sessionId, results, get } = await written(`artifact write '{"id":"app","title":"App","format":"url","content":"http://localhost:8080 "}'`);
    expect(results[0]).toContain('"created": true');
    expect(results[0]).toContain('"bytes": 21');
    expect(await get('app')).toMatchObject({ format: 'url', content: 'http://localhost:8080', version: 1 });
    expect(await kernel.exec('kvcoder.artifact.list', { sessionId })).toEqual([expect.objectContaining({ id: 'app', format: 'url', size: 21 })]);
  });

  it('QA12-E1 an address that is not local is refused, naming what is allowed, and nothing is stored', async () => {
    const bad = ['https://example.com', 'http://192.168.1.5:3000', 'ftp://localhost', 'javascript:alert(1)', 'http://user:pw@localhost:8080', 'two words', `http://localhost:8080/${'a'.repeat(2040)}`];
    const { kernel, sessionId, results } = await written(...bad.map((content, index) => `artifact write '${JSON.stringify({ id: `bad-${String(index)}`, title: 'Bad', format: 'url', content })}'`));
    expect(results).toHaveLength(bad.length);
    for (const result of results) expect(result).toMatch(/^error VALIDATION_FAILED: A url artifact holds one http or https address on localhost or 127\.0\.0\.1/);
    expect(await kernel.exec('kvcoder.artifact.list', { sessionId })).toEqual([]);
  });

  it('QA12-E2 editing a url artifact re-checks it: a remote result is refused and leaves it as it was', async () => {
    const { results, get } = await written(
      `artifact write '{"id":"u1","title":"U","format":"url","content":"http://localhost:8080"}'`,
      `artifact edit '{"id":"u1","edits":[{"oldText":"localhost:8080","newText":"example.com"}]}'`,
      `artifact edit '{"id":"u1","edits":[{"oldText":"localhost:8080","newText":"localhost:9090"}]}'`,
    );
    expect(results[1]).toMatch(/^error VALIDATION_FAILED: A url artifact holds one/);
    expect(results[2]).toContain('"replacements": 1');
    expect(await get('u1')).toMatchObject({ content: 'http://localhost:9090', version: 2 });
  });

  it('QA12-E6 an older artifact keeps its format, and a write that replaces it without one is read from its new content', async () => {
    const { get } = await written(
      `artifact write '{"id":"old","title":"Old","format":"markdown","content":"# Notes"}'`,
      body('{"id":"old","title":"Old"}', '<!doctype html><p>hi</p>'),
    );
    expect(await get('old')).toMatchObject({ format: 'html', version: 2 });
  });

  it('QA12-E8 artifact -h names the three formats and what is read from a format left out', async () => {
    const { results } = await written('artifact -h');
    expect(results[0]).toContain('the format is "markdown", "html", or "url" (left out,');
    expect(results[0]).toContain('a lone localhost address is "url"');
    expect(results[0]).toContain('scripts-only frame');
  });
});
