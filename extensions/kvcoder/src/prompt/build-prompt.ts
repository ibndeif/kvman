import type { Section } from '../registry/register-sections.ts';
import { sectionsLimit } from '../registry/register-sections.ts';

// The system prompt (plan 08 §8.2): the base prompt, the sections by `order`, then the connector index. Sections past
// 64 KB together are left out, last by `order` first (ADR 0009, 94).

export type PromptInput = {
  workspacePath: string;
  platform: NodeJS.Platform;
  shell: 'bash' | 'powershell';
  language: string;
  sections: readonly Section[];
  connectors: readonly { name: string; description: string; commands: readonly string[]; signatures?: readonly string[] }[];
};

export type BuiltPrompt = { prompt: string; included: ReadonlySet<Section>; left: readonly Section[] };

const systems: Partial<Record<NodeJS.Platform, string>> = { linux: 'Linux', darwin: 'macOS', win32: 'Windows' };

function languageName(code: string): string {
  const name = new Intl.DisplayNames(['en'], { type: 'language' }).of(code);
  return name === undefined || name === code ? code : `${name} (${code})`;
}

const howYouWork = [
  'How you work. Scale the process to the task: a task of one file or a few steps needs no plan, so just do it; a larger one follows these steps.',
  "1. Understand. Look for facts before you decide anything: read the request, then the files, config, and tests, and `docs get` where there is a guide. Never assume or invent names, paths, APIs, or behavior; when you can't find a fact, say so or ask.",
  "2. Resolve gaps and conflicts. If the request is unclear, contradicts itself or the code, or leaves out something that changes the result, ask: put each question in its own `ask` call, with all the calls in one reply, and use `ask choice` whenever you offer options, your recommended one first. Don't ask what looking would answer.",
  '3. Plan. Write the plan as the artifact `plan`: the goal, the steps in order as a checklist (☐ to do, ☑ done), what each step uses (a connector, a subagent), and how you will check it. Write it in the same reply as your first call. For a large, ambiguous, or risky task, call `ask confirm` on the plan before you start.',
  "4. Execute step by step. Make the smallest change for each step, check it with the project's own check or tests, fix a failure at its cause, and tick the step off with `artifact edit`. Write each file in its own call, with `fs write`. If the facts change, change the plan. Before you say that something runs or works, check it the way the person would: run it, request its address, or run its test; if you couldn't, say what is unchecked.",
  "5. Delegate when it helps. Hand a separate, self-contained part to a subagent when a specialist view or parallel work is worth it: a UI/UX designer for screens, a reviewer for a fresh look at your changes, a researcher for a question that takes a lot of reading. Brief it with its role, the goal, the facts it needs, its limits, and what to return. If another agent gave you your task, do that task and return the result; don't re-plan it, and ask the person only if you are blocked.",
  "Use the simplest practical way that follows the project's conventions and sound engineering practice, and don't add what wasn't asked.",
  'Show the person anything long to read or see (a plan, a report, a design, an HTML page) in an artifact, not in a reply.',
  'The calls of one reply run at the same time, so put calls that depend on each other in separate replies.',
  'To put a question to the person (a choice, a yes or no, a free answer), call `ask`.',
  'Keep replies short: say what you did and what is left.',
  'Say what you are about to do in the same reply as the call that does it, and never make a call that does nothing, such as `true`, just to keep going. A reply with no tool call is your final answer and ends the turn: when work remains, your reply must contain the call that does the next piece. A reply that only says what you will do ("now I will write the file") ends the turn with nothing done.',
].join('\n');

// The base prompt (ADR 0009, 163, 166, and 180; ADR 0011, 1): who the agent is, its one tool, connectors, and how it works.
function basePrompt(input: PromptInput): string {
  const shell = input.shell === 'bash' ? 'bash' : 'PowerShell';
  const identity = [
    `You are kvman Coder, an agent that builds software with the person, in the folder ${input.workspacePath} on ${systems[input.platform] ?? input.platform}.`,
    `Reply in ${languageName(input.language)} unless the person writes in another language.`,
  ].join('\n');
  const tool = 'Your one tool is run: it runs one command of a connector, as { description, connector, command, payload }. description is one sentence for the person, saying what the call does. Below, `fs write` means the connector fs and its command write.';
  const connectors = `Connectors are the only way you act. When a connector other than shell covers a task, use it instead of a shell line: it checks its input, returns structured results, and is shown to the person. Use shell only for what no other connector does. Every connector has the command help. A command listed below with its payload needs no help call; for any other command, or for what a field means, call the connector's help with { "command": "<name>" } before the first use. Each \`shell exec\` starts in the workspace folder, so cd doesn't carry over to the next call; the shell is ${shell}.`;
  return [identity, tool, connectors, howYouWork].join('\n\n');
}

// A connector's entry: its owner's description, then its commands, which kvcoder adds (ADR 0009, 164; ADR 0011, 3). A
// built-in's entry is one line per command with its payload's signature (ADR 0012, 1 and 14); `help`'s payload is `{ command? }`.
function connectorLine(connector: PromptInput['connectors'][number]): string {
  const description = /[.!?)]$/.test(connector.description.trimEnd()) ? connector.description.trimEnd() : `${connector.description.trimEnd()}.`;
  if (connector.signatures === undefined) return `- ${connector.name}: ${description} Commands: ${[...connector.commands, 'help'].join(', ')}.`;
  const signatures = connector.signatures;
  const names = [...connector.commands, 'help'];
  const width = Math.max(...names.map((name) => name.length));
  const rows = connector.commands.map((name, index) => {
    const signature = signatures[index];
    if (signature === undefined) throw new Error(`The connector ${connector.name} has no signature for the command ${name}.`);
    return `  ${name.padEnd(width)} ${signature}`;
  });
  rows.push(`  ${'help'.padEnd(width)} { command? }`);
  return [`- ${connector.name}: ${description}`, ...rows].join('\n');
}

function keptSections(sections: readonly Section[]): { kept: Section[]; left: Section[] } {
  const kept: Section[] = [];
  const left: Section[] = [];
  let total = 0;
  for (const section of sections) {
    if (total + section.size > sectionsLimit) {
      left.push(section);
      continue;
    }
    total += section.size;
    kept.push(section);
  }
  return { kept, left };
}

export function buildPrompt(input: PromptInput): BuiltPrompt {
  const { kept, left } = keptSections(input.sections);
  const parts = [basePrompt(input), ...kept.map((section) => `## ${section.title}\n${section.content}`)];
  if (input.connectors.length > 0) parts.push(['## Connectors', ...input.connectors.map(connectorLine)].join('\n'));
  return { prompt: parts.join('\n\n'), included: new Set(kept), left };
}
