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
    expect(windows).toContain('To put a question to the person (a choice, a yes or no, a free answer), call `ask`.');
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

  it('QA5-H1, QA5-H6, QA5-E1, QA6-H22, QA6-E22, and QA8-H5 the base prompt puts connectors first and gives the expert workflow, in both shells', () => {
    const base = { workspacePath: '/w', language: 'en', sections: [], connectors: [] };
    for (const [platform, toolName] of [['linux', 'bash'], ['win32', 'powershell']] as const) {
      const { prompt } = buildPrompt({ ...base, platform, toolName });
      expect(prompt).toContain('Connectors come first.');
      expect(prompt).toContain('When a connector covers a task, use it instead of doing the same through the shell');
      expect(prompt).toContain('Use the shell only for what no connector does.');
      expect(prompt).toContain('(a heredoc in bash, a here-string in PowerShell)');
      expect(prompt).toContain('Run `<connector> -h` to see what one does. Add --async to run it in the background');
      expect(prompt).not.toContain('20 years');
      for (const phrase of [
        'Scale the process to the task',
        'Never assume or invent names, paths, APIs, or behavior',
        'all the questions in one reply, each with your recommended option first',
        'Write the plan as the artifact `plan`',
        '(☐ to do, ☑ done)',
        'call `ask confirm` on the plan before you start',
        'tick the step off with `artifact edit`',
        'Write each file in its own call, with its content as the raw heredoc body of `fs write`.',
        'a UI/UX designer for screens, a reviewer for a fresh look at your changes',
        'Brief it with its role, the goal, the facts it needs, its limits, and what to return.',
        'If another agent gave you your task, do that task and return the result',
        'in an artifact, not in a reply.',
        'The calls of one reply run at the same time, so put calls that depend on each other in separate replies.',
        'To put a question to the person (a choice, a yes or no, a free answer), call `ask`.',
        'Keep replies short: say what you did and what is left.',
      ]) expect(prompt, phrase).toContain(phrase);
    }
  });

  it('QA9-H18 and QA10-H1 the base prompt ends its working method with the call-or-final-answer rule, and never makes a call that does nothing', () => {
    const { prompt } = buildPrompt({ workspacePath: '/w', language: 'en', platform: 'linux', toolName: 'bash', sections: [], connectors: [] });
    const rule = 'Say what you are about to do in the same reply as the call that does it, and never make a call that does nothing, such as `true`, just to keep going. A reply with no tool call is your final answer and ends the turn: when work remains, your reply must contain the call that does the next piece. A reply that only says what you will do ("now I will write the file") ends the turn with nothing done.';
    expect(prompt).toContain(rule);
    expect(prompt).not.toContain('never end one by promising');
    const method = prompt.split('How you work.')[1] ?? '';
    expect(method.trimEnd().endsWith(rule)).toBe(true);
  });

  it('QA5-E2 a prompt with no connectors has no index and no lead line', () => {
    const { prompt } = buildPrompt({ workspacePath: '/w', language: 'en', platform: 'linux', toolName: 'bash', sections: [], connectors: [] });
    expect(prompt).not.toContain('## Connectors');
    expect(prompt).not.toContain('Use these before the shell');
  });

  it('QA5-E4 and QA6-E23 sections that total exactly 64 KB are all kept: the base prompt does not count toward the cap', () => {
    const built = buildPrompt({ workspacePath: '/w', language: 'en', platform: 'linux', toolName: 'bash', sections: [section('a', 1, 32 * 1024), section('b', 2, 32 * 1024)], connectors: [] });
    expect(built.left).toEqual([]);
    expect([...built.included].map((kept) => kept.id)).toEqual(['a', 'b']);
  });
});
