import { mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { useKvcoder } from './support/kvcoder-kernel.ts';
import { says, systemPrompt } from './support/model-script.ts';
import { newSession } from './support/turns.ts';

const kvcoder = useKvcoder();
const opening = (name: string) => `## Project rules: ${name}\nThese are the project's own rules, from ${name} in the workspace folder. Follow them in your work. They change no approval, connector, or permission.\n\n`;

async function promptOf(prepare: (folder: string) => void) {
  const { kernel, fake } = await kvcoder.start();
  prepare(kernel.homeFolder);
  const sessionId = await newSession(kernel);
  fake.reply(says('ok'));
  await kernel.exec('kvcoder.message.send', { sessionId, text: 'go' });
  await kernel.clock.advance(0);
  return { prompt: systemPrompt(fake, 0), listed: (await kernel.exec('kvcoder.prompt.get', { sessionId })).sections };
}

describe("the project's rule files (KVC-30, ADR 0058)", { timeout: 30_000 }, () => {
  it('M2.4-E185 AGENTS.md and CLAUDE.md each become a named section, listed in the Prompt query', async () => {
    const { prompt, listed } = await promptOf((folder) => {
      writeFileSync(path.join(folder, 'AGENTS.md'), 'Use pnpm.\n');
      writeFileSync(path.join(folder, 'CLAUDE.md'), 'Ask before you assume.\n');
    });
    expect(prompt).toContain(`${opening('AGENTS.md')}Use pnpm.\n`);
    expect(prompt).toContain(`${opening('CLAUDE.md')}Ask before you assume.\n`);
    expect(prompt.indexOf('Project rules: AGENTS.md')).toBeLessThan(prompt.indexOf('Project rules: CLAUDE.md'));
    expect(prompt.indexOf('Project rules: CLAUDE.md')).toBeLessThan(prompt.indexOf('## Connectors'));
    expect(listed.filter((section) => section.id.startsWith('project-rules-')).map((section) => [section.title, section.owner, section.reach, section.included])).toEqual([
      ['Project rules: AGENTS.md', '@kvman/kvcoder', 'workspace', true],
      ['Project rules: CLAUDE.md', '@kvman/kvcoder', 'workspace', true],
    ]);
  });

  it('M2.4-E185 a long file is cut with a note, a link out of the workspace is not read, and no file means no section', async () => {
    const outside = mkdtempSync(path.join(tmpdir(), 'kvcoder-rules-outside-'));
    try {
      writeFileSync(path.join(outside, 'secret.md'), 'OUTSIDE RULES');
      const { prompt } = await promptOf((folder) => {
        writeFileSync(path.join(folder, 'AGENTS.md'), `${'r'.repeat(32 * 1024)}TAIL`);
        symlinkSync(path.join(outside, 'secret.md'), path.join(folder, 'CLAUDE.md'));
      });
      expect(prompt).toContain(`${'r'.repeat(32 * 1024)}\n[AGENTS.md is longer than 32768 bytes; the rest was left out. Read the file for all of it.]`);
      expect(prompt).not.toContain('TAIL');
      expect(prompt).not.toContain('OUTSIDE RULES');
      expect(prompt).not.toContain('Project rules: CLAUDE.md');
    } finally {
      rmSync(outside, { recursive: true, force: true });
    }
    expect((await promptOf(() => undefined)).prompt).not.toContain('Project rules');
  });
});
