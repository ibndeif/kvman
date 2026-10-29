import { describe, expect, it } from 'vitest';
import { useKvcoder } from './support/kvcoder-kernel.ts';
import { says, systemPrompt } from './support/model-script.ts';
import { newSession } from './support/turns.ts';

const kvcoder = useKvcoder();

describe('the prompt (08 §8.2, §8.4)', { timeout: 30_000 }, () => {
  it('M2.4-E36 and QA5-E5 binary checks run at the first step and are stored; only passing ones are listed; a setting entry with a registered name is ignored', async () => {
    const settings = {
      'kvcoder.connectors': [
        { name: 'works', description: 'A program that is there.', binary: { check: 'true' } },
        { name: 'missing', description: 'A program that is not.', binary: { check: 'exit 3' } },
        { name: 'todo', description: 'Clashes with the registered connector.', binary: { check: 'true' } },
      ],
    };
    const { kernel, fake } = await kvcoder.start({ settings });
    await kernel.exec('kvcoder.connector.register', { name: 'gh', description: 'GitHub CLI.', binary: { check: 'true', install: 'https://cli.github.com' } }, { as: '@test/todo' });
    expect((await kernel.exec('kvcoder.connector.list', {})).map((connector) => `${connector.name}:${connector.owner}`).sort()).toEqual(['gh:@test/todo', 'missing:kvcoder.connectors', 'todo:@test/todo', 'works:kvcoder.connectors']);
    const sessionId = await newSession(kernel);
    expect((await kernel.exec('kvcoder.session.get', { sessionId })).checks).toBeUndefined();
    fake.reply(says('hi'));
    await kernel.exec('kvcoder.message.send', { sessionId, text: 'go' });
    await kernel.clock.advance(0);
    expect((await kernel.exec('kvcoder.session.get', { sessionId })).checks).toEqual(expect.arrayContaining([{ name: 'gh', passed: true }, { name: 'works', passed: true }, { name: 'missing', passed: false }]));
    const prompt = systemPrompt(fake);
    expect(prompt).toContain('- works: A program that is there. Commands: exec, help.');
    expect(prompt).toContain('- gh: GitHub CLI. Commands: exec, help.');
    expect(prompt).not.toContain('- missing:');
    expect(prompt).not.toContain('Clashes');
    expect(prompt).toContain('## Connectors\n- shell: ');
  });

  it('QA31-H10 the base prompt speaks of workers, not of subagents', async () => {
    const { kernel, fake } = await kvcoder.start();
    fake.reply(says('hi'));
    await kernel.exec('kvcoder.message.send', { sessionId: await newSession(kernel), text: 'go' });
    await kernel.clock.advance(0);
    const prompt = systemPrompt(fake, 0);
    expect(prompt).toContain('\nDelegate. A step goes to a worker of the `delegate` connector when the worker does it better or faster than you would: a specialist whose skill the step needs, separate work that runs beside yours, or a fresh review of a change you finished; its entry lists the workers and what each is for.');
    expect(prompt).toContain('Several `delegate run` calls in one reply run in parallel. Brief the worker with the goal, the facts it needs, its limits, and what to return.');
    expect(prompt).toContain('or a worker of the `delegate` connector whose description fits when the step needs that skill');
    expect(prompt).not.toContain('to a subagent');
  });

  // QA68-H5: the index lists the council after the reviewer (ADR 0103).
  it("QA68-H5, QA12-E8, QA12-H8, and M2.4-E53, QA4-H15, QA4-H16, QA4-H17, QA5-H1, QA5-H3, QA5-H5, QA5-E3, QA6-H22, QA6-H23, and QA8-H5 the base prompt names the shell, the OS, the language, and the workspace folder; then sections by order; then the connector index", async () => {
    const { kernel, fake } = await kvcoder.start({ settings: { 'kernel.language': 'ar' } });
    const sessionId = await newSession(kernel);
    await kernel.exec('kvcoder.section.set', { id: 'later', title: 'Later', order: 30, content: 'L' }, { as: '@test/todo' });
    await kernel.exec('kvcoder.section.set', { id: 'mine', title: 'Mine', order: 5, content: 'M', sessionId }, { as: '@test/todo' });
    await kernel.exec('kvcoder.section.set', { id: 'everywhere', title: 'Everywhere', order: 10, content: 'E', global: true }, { as: '@test/todo' });
    fake.reply(says('hi'));
    await kernel.exec('kvcoder.message.send', { sessionId, text: 'go' });
    await kernel.clock.advance(0);
    const prompt = systemPrompt(fake);
    expect(prompt).toBe((await kernel.exec('kvcoder.prompt.get', { sessionId })).prompt);
    const system = new Map([['linux', 'Linux'], ['darwin', 'macOS'], ['win32', 'Windows']]).get(process.platform);
    expect(prompt).toContain(`in the folder ${kernel.homeFolder} on ${String(system)}`);
    expect(prompt).toContain('Reply in Arabic (ar) unless the person writes in another language.');
    expect(prompt).toContain('Your one tool is run: it runs one command of a connector, as { connector, command, payload }.');
    expect(prompt).toContain(`Each \`shell exec\` starts in the workspace folder, so cd doesn't carry over to the next call; the shell is ${process.platform === 'win32' ? 'PowerShell' : 'bash'}.`);
    expect(prompt).toContain('- shell: Run a line in the real shell');
    expect(prompt).toContain('Set background to true for a server or any command that keeps running; to show the person an app you started, give its address to artifact write with the format url.\n  exec { line, background?, notify?, timeoutMs?, risky }\n  help { command? }');
    expect(prompt).toContain('- fs: Read, list, search, create, and change files in the workspace folder.');
    expect(prompt).toContain('and edit for exact text replacements in an existing file.\n  read       { path, fromLine?, fromColumn?, lines? }\n  read-files { files: [{ path, fromLine?, lines? }] }\n  list       { path? }\n  find       { pattern, path? }\n  search     { pattern, path?, literal?, glob?, context?, filesOnly? }\n  write      { path, content, risky }\n  edit       { path, edits: [{ oldText, newText, replaceAll? }], risky }\n  undo       { path, risky }\n  part       { path, part, content }\n  assemble   { path, risky }\n  help       { command? }');
    expect(prompt).toContain('- artifact: Show the person something to read or see: a report, a design, an HTML page, or the localhost address of an app you are running (format url).');
    expect(prompt).toContain("A form can't be submitted there either: make a button act on its click and a field on the Enter key, in JavaScript");
    expect(prompt).toContain('say that its interaction is unchecked unless you tested it another way.');
    expect(prompt).toContain('A url artifact is a normal page on its own address and has none of these limits.\n  write  { id (≤50), title (≤100), format?: "markdown" | "html" | "url", content }\n  edit   { id (≤50), edits: [{ oldText, newText, replaceAll? }] }\n  get    { id (≤50) }\n  delete { id (≤50) }\n  help   { command? }');
    expect(prompt).toContain('- background: Follow up on what you started with background set to true: a server or other long-running shell line, or a background subagent. Use it to see its status or output, to wait for it to end, or to stop it.');
    expect(prompt).toContain('\n  list   {}\n  output { id, lines? }\n  wait   { id, timeoutMs? }\n  stop   { id }\n  help   { command? }');
    expect(prompt).toContain('- ask: Put a question to the person and wait for the answer. Use it when you need a decision, a missing detail, or a go-ahead before a risky step, instead of guessing.\n  text    { prompt, placeholder? }\n  choice  { prompt, multiple, options: [{ id, label, description? }], other? }\n  confirm { prompt, danger? }\n  help    { command? }');
    expect(prompt).toContain('- delegate: Hand a self-contained task to a worker: a helper agent that works on it alone and returns its answer. Use it for a specialist view or to do a separate part in parallel, or with background set to true while you go on. Workers: general (Any separate, self-contained task), ui-ux (Designs the experience and the look of a screen or flow, to usability and accessibility standards), architect (Designs the structure of a change, on sound engineering practice and the project\'s own patterns and conventions; read-only), tester (QA engineer: writes and runs test cases, automated and by hand as a person would, on the critical flows, security, and performance, and reports the issues), reviewer (Reviews code and reports wrong style, needless complexity, and unclean or unclear code; read-only), council (A council that debates a complex request whose approach is open (an engineer, a devil\'s advocate, a dumb customer, and the field\'s top expert) until its fatal flaws are fixed, and returns the final plan; for complex work only, before any execution map; read-only).\n  run      { worker, title (≤200), task, background? }\n  continue { id, message, background? }\n  help     { command? }');
    expect(prompt).toContain('Connectors are the only way you act.');
    expect(prompt).toContain('the `execution-map` entry below says how to set it');
    expect(prompt).toContain('Several new files are several `fs write` calls in one reply');
    // A registered connector's commands have their signatures (ADR 0108, 14).
    expect(prompt.endsWith('- todo: Keep a todo list.\n  add  { text }\n  wait { gate, text }\n  fail {}\n  list {}\n  help { command? }')).toBe(true);
    const order = ['## Mine', '## Everywhere', '## Later', '## Connectors', '- shell: ', '- fs: ', '- artifact: ', '- execution-map: ', '- background: ', '- ask: ', '- delegate: ', '- todo: Keep a todo list.'].map((part) => prompt.indexOf(part));
    expect(order.every((index) => index > 0)).toBe(true);
    expect([...order].sort((first, second) => first - second)).toEqual(order);
  });
});
