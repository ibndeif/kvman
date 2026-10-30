import { describe, expect, it } from 'vitest';
import { risky } from '../../src/connectors/payload-fields.ts';
import { buildPrompt } from '../../src/prompt/build-prompt.ts';
import { workingMethod } from '../../src/prompt/working-method.ts';
import type { Section } from '../../src/registry/register-sections.ts';

const section = (id: string, order: number, size: number): Section => ({ id, title: id, order, owner: '@test/todo', global: false, sessionId: null, content: 'x'.repeat(size), size });

describe('the prompt builder (08 §8.2)', () => {
  it("M2.4-E53, QA4-H14, and QA5-E3 the base prompt names each OS and its shell, sections follow, the index ends it, and sections past 64 KB are left out", () => {
    const base = { role: 'lead' as const, workspacePath: '/w', language: 'en', sections: [], connectors: [{ name: 'todo', description: 'Keep a todo list.', commands: ['add', 'list'] }] };
    expect(buildPrompt({ ...base, platform: 'darwin', shell: 'bash' }).prompt).toContain('in the folder /w on macOS.\nReply in English (en)');
    const windows = buildPrompt({ ...base, platform: 'win32', shell: 'powershell' }).prompt;
    expect(windows).toContain('on Windows');
    expect(windows).toContain('Your one tool is run: it runs one command of a connector, as { connector, command, payload }.');
    expect(windows).toContain('the shell is PowerShell.');
    expect(windows.endsWith('## Connectors\n- todo: Keep a todo list. Commands: add, list, help.')).toBe(true);
    expect(windows).toContain('To put a question to the person (a choice, a yes or no, a free answer), call `ask`.');
    const big = [section('a', 1, 30_000), section('b', 2, 30_000), section('c', 3, 10_000), section('d', 4, 4_000)];
    const built = buildPrompt({ ...base, platform: 'linux', shell: 'bash', sections: big });
    expect(built.left.map((left) => left.id)).toEqual(['c']);
    expect([...built.included].map((kept) => kept.id)).toEqual(['a', 'b', 'd']);
  });

  it('QA4-H16, QA5-H3, and QA18-H8 every connector entry ends with its commands and help, and a description without final punctuation gets a full stop first', () => {
    const connectors = [
      { name: 'ask', description: 'Ask the person.', commands: ['text'] },
      { name: 'todo', description: 'Keep a todo list', commands: ['add', 'list'] },
      { name: 'gh', description: 'GitHub CLI!', commands: ['exec'] },
    ];
    const { prompt } = buildPrompt({ role: 'lead', workspacePath: '/w', language: 'en', platform: 'linux', shell: 'bash', sections: [], connectors });
    expect(prompt.split('## Connectors\n')[1]?.split('\n')).toEqual(['- ask: Ask the person. Commands: text, help.', '- todo: Keep a todo list. Commands: add, list, help.', '- gh: GitHub CLI! Commands: exec, help.']);
  });

  it('QA5-H1, QA5-H6, QA5-E1, QA6-H22, QA6-E22, and QA8-H5 the base prompt makes connectors the only way to act and gives the expert workflow, in both shells', () => {
    const base = { role: 'lead' as const, workspacePath: '/w', language: 'en', sections: [], connectors: [] };
    for (const [platform, shell] of [['linux', 'bash'], ['win32', 'powershell']] as const) {
      const { prompt } = buildPrompt({ ...base, platform, shell });
      expect(prompt).toContain('Connectors are the only way you act.');
      expect(prompt).toContain('When a connector other than shell covers a task, use it instead of a shell line');
      expect(prompt).toContain('Use shell only for what no other connector does.');
      expect(prompt).toContain('Every connector has the command help. A command listed below with its payload needs no help call');
      expect(prompt).toContain(`the shell is ${shell === 'bash' ? 'bash' : 'PowerShell'}.`);
      for (const gone of ['heredoc', '--async', ' -h']) expect(prompt, gone).not.toContain(gone);
      expect(prompt).not.toContain('20 years');
      for (const phrase of [
        'No path is fixed: you choose it for each task from what the task is',
        'Never assume or invent names, paths, APIs, or behavior',
        'ask before any work.',
        'put every question in the same reply, one `ask` call each, never one question per reply, and use `ask choice` whenever you offer options, your recommended one first and each option saying what it leads to.',
        'the `execution-map` entry below says how to set it',
        'call `ask choice` with other set to true',
        'mark the step done with your evidence',
        'Leave running what the person will try themselves',
        // ADR 0108, 2 and 4: the Delegate rule names the run kinds and the brief's fields.
        "Delegate find, check, and review runs, and change runs only when two or more run at once on files that don't overlap;",
        'Write the brief in plain full sentences: goal is one sentence of what the run delivers, done one condition anyone can check,',
        'You are the one who decides: connectors and workers are how you act, and the result is yours.',
        'in an artifact, not in a reply.',
        'Work in few steps. Each reply is a step, and every step sends the whole conversation again, so make in one reply every call you can make now: reads and searches run at the same time, and calls that change something (shell lines, writes, edits) run one after another in the order you give them. Read a few files with one `fs read-files`, put independent calls (searches, separate files, separate workers) in the same reply, as several run calls or one run with a calls list, and leave for a later reply only a call that needs another call\'s result. Several new files are several `fs write` calls in one reply, not one reply each.',
        'To put a question to the person (a choice, a yes or no, a free answer), call `ask`.',
        'Your final answer says what you did and what is left.',
      ]) expect(prompt, phrase).toContain(phrase);
    }
  });

  it('QA19-H5 the prompt\'s new sentences', () => {
    for (const [platform, shell] of [['linux', 'bash'], ['win32', 'powershell']] as const) {
      const { prompt } = buildPrompt({ role: 'lead', workspacePath: '/w', language: 'en', platform, shell, sections: [], connectors: [] });
      for (const sentence of [
        'Every connector has the command help. A command listed below with its payload needs no help call; for any other command, or for what a field means, call the connector\'s help with { "command": "<name>" } before the first use.',
        'A small, clear change needs doing and checking, and nothing more.',
        'ask before any work.',
        'put every question in the same reply, one `ask` call each, never one question per reply, and use `ask choice` whenever you offer options, your recommended one first and each option saying what it leads to.',
        'Before you say that something runs or works, check it the way the person would: run it, request its address, or run its test; if you couldn\'t, say what is unchecked.',
      ])
        expect(prompt, sentence).toContain(sentence);
      for (const gone of [
        'call it before the first time you use a command whose payload you don\'t know',
        'a small, clear change needs no plan',
        'Scale the process to the task',
        'about five calls',
        'call `ask` with all the questions in one reply',
      ])
        expect(prompt, gone).not.toContain(gone);
    }
  });

  it('QA19-H15, M2.4-E264, and QA59-H8 the prompt says how to judge risky, to request a started server, and what a small task needs', () => {
    const { prompt } = buildPrompt({ role: 'lead', workspacePath: '/w', language: 'en', platform: 'linux', shell: 'bash', sections: [], connectors: [] });
    const judged = "`shell exec`, `fs write`, `fs edit`, `mcp call`, and `mcp run` take risky, which you always send and judge for each call from what the call does, not from which command it is. It is false for the ordinary work of the task: creating, editing, or rewriting a file inside the workspace folder that the task needs, whoever made it and whether or not the repository has uncommitted changes (`fs undo` takes such a change back, so a change to a file is never risky by itself), running the project's own build, tests, and tools, and a tool that only reads. It is true, and the person is then asked first, only when the call could do what is hard to take back or reaches past the task: anything outside the workspace folder; deleting files, or overwriting them with a shell line; a file that holds secrets, such as .env or a key; rewriting or discarding git history or uncommitted work (push --force, git reset, checkout, restore, stash drop, clean); sudo, or an install outside the project; sending something out (a push, a publish, a deploy, a message, a write to a remote service); and the Commands section of AGENTS.md. When you can't tell whether a call can be taken back, it is true. Each `shell exec` starts in the workspace folder";
    for (const role of ['lead', 'worker'] as const) {
      const of = buildPrompt({ role, workspacePath: '/w', language: 'en', platform: 'linux', shell: 'bash', sections: [], connectors: [] }).prompt;
      expect(of, role).toContain(judged);
      expect(of, role).not.toContain('your own work');
    }
    expect(risky.description).toContain('false for the ordinary work of the task: a file inside the workspace folder that the task needs, whoever made it');
    expect(risky.description).not.toContain('own work');
    const check = "\nBefore you say that something runs or works, check it the way the person would: run it, request its address, or run its test; if you couldn't, say what is unchecked. After you start a server, request its address once before you give it to the person.\n";
    expect(prompt).toContain(check);
    expect(prompt.split('\n').find((line) => line.startsWith('Execute. '))).not.toContain('Before you say');
    expect(prompt).toContain('A small, clear change needs doing and checking, and nothing more.');
  });

  it('QA9-H18 and QA10-H1 the base prompt ends its working method with the call-or-final-answer rule, and never makes a call that does nothing', () => {
    const { prompt } = buildPrompt({ role: 'lead', workspacePath: '/w', language: 'en', platform: 'linux', shell: 'bash', sections: [], connectors: [] });
    const rule = 'A reply with no tool call is your final answer and ends the turn: when work remains, your reply must contain the call that does the next piece. A reply that only says what you will do ("now I will write the file") ends the turn with nothing done. Never make a call that does nothing, such as `true`, just to keep going.';
    expect(prompt).toContain(rule);
    expect(prompt).not.toContain('never end one by promising');
    expect(prompt).not.toContain('Say what you are about to do in the same reply');
    const method = prompt.split('How you work.')[1] ?? '';
    expect(method.trimEnd().endsWith(rule)).toBe(true);
  });

  it('QA59-H8 risky says a file change is never risky by itself, and names what discards uncommitted work', () => {
    expect(risky.description).toContain('whether or not there are uncommitted changes (fs undo takes it back)');
    expect(risky.description).toContain('git push --force, reset, checkout, restore, stash drop, or clean');
  });

  it('QA57-H9 and QA57-H10 a map only for large or risky work, and every question in the same reply', () => {
    const method = workingMethod('lead');
    expect(method).toContain('Work that changes several parts that depend on each other, or that is hard to take back, needs an execution map the person agreed to; other work, even of a few steps, needs no map: do it, and say where you are as you go.');
    expect(method).toContain('Plan. Only when your path needs a map, and only after you understood the request');
    expect(method).not.toContain('Work in several parts');
    expect(method).toContain('put every question in the same reply, one `ask` call each, never one question per reply');
    expect(workingMethod('lead', 'general')).toContain('one question per call, all the calls in the same reply and never one question per reply');
  });

  it('QA5-E2 a prompt with no connectors has no index', () => {
    const { prompt } = buildPrompt({ role: 'lead', workspacePath: '/w', language: 'en', platform: 'linux', shell: 'bash', sections: [], connectors: [] });
    expect(prompt).not.toContain('## Connectors');
  });

  it('QA5-E4 and QA6-E23 sections that total exactly 64 KB are all kept: the base prompt does not count toward the cap', () => {
    const built = buildPrompt({ role: 'lead', workspacePath: '/w', language: 'en', platform: 'linux', shell: 'bash', sections: [section('a', 1, 32 * 1024), section('b', 2, 32 * 1024)], connectors: [] });
    expect(built.left).toEqual([]);
    expect([...built.included].map((kept) => kept.id)).toEqual(['a', 'b']);
  });
});
