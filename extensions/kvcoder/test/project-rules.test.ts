import { mkdirSync, mkdtempSync, rmSync, symlinkSync, unlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { useKvcoder } from './support/kvcoder-kernel.ts';
import { command, requestMessages, runs, says, systemPrompt, textOf } from './support/model-script.ts';
import { delegated } from './support/helpers.ts';
import { newSession } from './support/turns.ts';
import { brief } from './support/workers.ts';

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

describe('rule files one level down, kept for the chat (ADR 0108, 6)', { timeout: 30_000 }, () => {
  const changeNotes = (fake: Parameters<typeof systemPrompt>[0], index: number): string[] => requestMessages(fake, index).filter((message) => message.role === 'user' && textOf(message).includes('changed since this chat started')).map(textOf);

  it('QA71-H17 and QA72-E1 a folder directly inside the workspace gives its rules, and hidden folders and node_modules are not read', async () => {
    const { prompt } = await promptOf((folder) => {
      for (const name of ['research', '.hidden', 'node_modules/x']) mkdirSync(path.join(folder, name), { recursive: true });
      writeFileSync(path.join(folder, 'research', 'AGENTS.md'), 'Testing: Run the existing tests only.\n');
      writeFileSync(path.join(folder, '.hidden', 'AGENTS.md'), 'HIDDEN RULES');
      writeFileSync(path.join(folder, 'node_modules', 'AGENTS.md'), 'MODULE RULES');
      writeFileSync(path.join(folder, 'node_modules', 'x', 'AGENTS.md'), 'DEEP RULES');
    });
    expect(prompt).toContain(`${opening('research/AGENTS.md')}Testing: Run the existing tests only.\n`);
    for (const text of ['HIDDEN RULES', 'MODULE RULES', 'DEEP RULES']) expect(prompt).not.toContain(text);
  });

  it('QA71-H18 and QA71-E17 an edited rule file keeps the system prompt and is told once; a removed one is told without text', async () => {
    const { kernel, fake } = await kvcoder.start();
    const file = path.join(kernel.homeFolder, 'AGENTS.md');
    writeFileSync(file, 'Use pnpm.\n');
    const sessionId = await newSession(kernel);
    const turn = async (text: string): Promise<void> => {
      fake.reply(says('ok'));
      await kernel.exec('kvcoder.message.send', { sessionId, text });
      await kernel.clock.advance(0);
    };
    await turn('one');
    writeFileSync(file, 'Use npm.\n');
    await turn('two');
    await turn('three');
    expect(systemPrompt(fake, 1)).toBe(systemPrompt(fake, 0));
    expect(systemPrompt(fake, 2)).toBe(systemPrompt(fake, 0));
    expect(changeNotes(fake, 1)).toEqual(['[kvman: AGENTS.md changed since this chat started. Its current text:]\nUse npm.\n']);
    expect(changeNotes(fake, 2)).toHaveLength(1);
    unlinkSync(file);
    await turn('four');
    expect(changeNotes(fake, 3).at(-1)).toBe('[kvman: AGENTS.md changed since this chat started. It no longer exists.]');
    expect(changeNotes(fake, 3)).toHaveLength(2);
  });

  it('QA71-E18 a long rule file in a folder is cut with its note', async () => {
    const { prompt } = await promptOf((folder) => {
      mkdirSync(path.join(folder, 'app'));
      writeFileSync(path.join(folder, 'app', 'CLAUDE.md'), `${'r'.repeat(32 * 1024)}TAIL`);
    });
    expect(prompt).toContain('\n[app/CLAUDE.md is longer than 32768 bytes; the rest was left out. Read the file for all of it.]');
    expect(prompt).not.toContain('TAIL');
  });

  it("QA71-E19 a helper made after an edit keeps its lead's kept rules", async () => {
    const world = await kvcoder.start();
    const file = path.join(world.kernel.homeFolder, 'AGENTS.md');
    writeFileSync(file, 'Use pnpm.\n');
    const sessionId = await newSession(world.kernel);
    await delegated(world, sessionId, [says('ok')], [], 'one');
    writeFileSync(file, 'Use npm.\n');
    await delegated(world, sessionId, [runs(command('delegate', 'run', brief('general'))), says('Started.'), says('Read it.')], [says('looked')], 'two');
    const helper = systemPrompt(world.helperFake, 0);
    expect(helper).toContain(`${opening('AGENTS.md')}Use pnpm.\n`);
    expect(helper).not.toContain('Use npm.');
  });
});
