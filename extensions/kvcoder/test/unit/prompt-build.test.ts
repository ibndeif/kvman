import { describe, expect, it } from 'vitest';
import { buildPrompt } from '../../src/prompt/build-prompt.ts';
import type { Section } from '../../src/registry/register-sections.ts';

const section = (id: string, order: number, size: number): Section => ({ id, title: id, order, owner: '@test/todo', global: false, sessionId: null, content: 'x'.repeat(size), size });

describe('the prompt builder (08 §8.2)', () => {
  it("M2.4-E53, QA4-H14, and QA5-E3 the base prompt names each OS and its shell, sections follow, the index ends it, and sections past 64 KB are left out", () => {
    const base = { workspacePath: '/w', language: 'en', sections: [], connectors: [{ name: 'todo', description: 'Keep a todo list.', kind: 'commands' as const }] };
    expect(buildPrompt({ ...base, platform: 'darwin', toolName: 'bash' }).prompt).toContain('in the folder /w on macOS.\nReply in English (en)');
    const windows = buildPrompt({ ...base, platform: 'win32', toolName: 'powershell' }).prompt;
    expect(windows).toContain('on Windows');
    expect(windows).toContain('Your one tool is powershell: it runs a PowerShell command.');
    expect(windows.endsWith("## Connectors\nUse these before the shell, whenever one covers the task.\n- todo: Keep a todo list. Help: `todo -h` lists its commands; `todo <command> -h` shows a command's input, output, and examples.")).toBe(true);
    expect(windows).toContain('To put a question to the person (a choice, a yes or no, a free answer), call `ask`. A reply with no tool call ends your turn, so never end one by promising something still to come');
    const big = [section('a', 1, 30_000), section('b', 2, 30_000), section('c', 3, 10_000), section('d', 4, 4_000)];
    const built = buildPrompt({ ...base, platform: 'linux', toolName: 'bash', sections: big });
    expect(built.left.map((left) => left.id)).toEqual(['c']);
    expect([...built.included].map((kept) => kept.id)).toEqual(['a', 'b', 'd']);
  });

  it('QA4-H16 and QA5-H3 every connector entry ends with how to get its help, and a description without final punctuation gets a full stop first', () => {
    const connectors = [
      { name: 'todo', description: 'Keep a todo list', kind: 'commands' as const },
      { name: 'ask', description: 'Ask the person (commands: text).', kind: 'builtin' as const },
      { name: 'gh', description: 'GitHub CLI!', kind: 'binary' as const },
    ];
    const { prompt } = buildPrompt({ workspacePath: '/w', language: 'en', platform: 'linux', toolName: 'bash', sections: [], connectors });
    expect(prompt.split('## Connectors\n')[1]?.split('\n')).toEqual([
      'Use these before the shell, whenever one covers the task.',
      "- todo: Keep a todo list. Help: `todo -h` lists its commands; `todo <command> -h` shows a command's input, output, and examples.",
      '- ask: Ask the person (commands: text). Help: `ask -h`.',
      '- gh: GitHub CLI! Help: `gh -h`.',
    ]);
  });

  it('QA5-H1, QA5-H2, QA5-H6, and QA5-E1 the base prompt puts connectors first and gives the working method, in both shells', () => {
    const base = { workspacePath: '/w', language: 'en', sections: [], connectors: [] };
    for (const [platform, toolName] of [['linux', 'bash'], ['win32', 'powershell']] as const) {
      const { prompt } = buildPrompt({ ...base, platform, toolName });
      expect(prompt).toContain('Connectors come first.');
      expect(prompt).toContain('When a connector covers a task, use it instead of doing the same through the shell');
      expect(prompt).toContain('Use the shell only for what no connector does.');
      expect(prompt).toContain('(a heredoc in bash, a here-string in PowerShell)');
      expect(prompt).toContain('Run `<connector> -h` to see what one does. Add --async to run it in the background');
      expect(prompt).toContain('Look before you change: read the files first, then make the smallest change that does the job.');
      expect(prompt).toContain("Check your work with the project's own check or tests before you say it is done.");
      expect(prompt).toContain('The calls of one reply run at the same time, so put calls that depend on each other in separate replies.');
      expect(prompt).toContain('call `ask`');
      expect(prompt).toContain('Keep replies short: say what you did and what is left.');
      expect(prompt).not.toContain('20 years');
    }
  });

  it('QA5-E2 a prompt with no connectors has no index and no lead line', () => {
    const { prompt } = buildPrompt({ workspacePath: '/w', language: 'en', platform: 'linux', toolName: 'bash', sections: [], connectors: [] });
    expect(prompt).not.toContain('## Connectors');
    expect(prompt).not.toContain('Use these before the shell');
  });

  it('QA5-E4 sections that total exactly 64 KB are all kept: the base prompt does not count toward the cap', () => {
    const built = buildPrompt({ workspacePath: '/w', language: 'en', platform: 'linux', toolName: 'bash', sections: [section('a', 1, 32 * 1024), section('b', 2, 32 * 1024)], connectors: [] });
    expect(built.left).toEqual([]);
    expect([...built.included].map((kept) => kept.id)).toEqual(['a', 'b']);
  });
});
