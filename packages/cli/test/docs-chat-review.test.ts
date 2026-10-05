import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

// The documentation after the chat review (QA19-H14): the pages say what an invalid payload returns now, where the
// agent learns a payload, and that `kvai.complete` takes `sessionId`.

const root = path.resolve(fileURLToPath(new URL('.', import.meta.url)), '..', '..', '..');
const read = (...parts: string[]): string => readFileSync(path.join(root, ...parts), 'utf8');
const markdownIn = (...parts: string[]): string[] => readdirSync(path.join(root, ...parts)).filter((name) => name.endsWith('.md')).map((name) => path.join(...parts, name));

const pages = [...markdownIn('docs', 'developers'), ...markdownIn('docs', 'user-guide'), ...['kvcoder', 'kvcustomizer', 'kvwebui', 'kvai'].flatMap((extension) => markdownIn('extensions', extension, 'docs'))];

describe('the documentation after the chat review (QA19-H14, ADR 0012)', () => {
  it('QA19-H14 the docs follow', () => {
    const connectors = read('extensions', 'kvcoder', 'docs', 'connectors.md');
    expect(connectors).toContain("returns each problem and then the payload's signature, such as `{ text, done? }`");
    expect(connectors).toContain("The prompt lists the payloads of kvcoder's own connectors (`shell`, `fs`, `artifact`, `background`, `ask`, `delegate`); the agent learns a registered connector's payloads from `help`");
    expect(read('extensions', 'kvai', 'docs', 'models.md')).toContain('`sessionId?: string`');
    for (const page of pages) expect(read(page), page).not.toContain("returns each problem and then the payload's JSON Schema");
  });
});
