import type { Section } from '../registry/register-sections.ts';
import { sectionsLimit } from '../registry/register-sections.ts';
import { identityLine, workingMethod, type Method, type Role } from './working-method.ts';

// The system prompt (plan 08 §8.2): the base prompt, the sections by `order`, a worker's instructions, then the
// connector index. Sections past 64 KB together are left out, last by `order` first (ADR 0009, 94).

export type PromptInput = {
  /** The lead of a chat, or a worker's subagent: each has its own identity and working method (ADR 0022, 3). */
  role: Role;
  /** A product's profile (ADR 0082, 11): who the agent is, and its method; without one, kvman Coder's engineering method. */
  profile?: { identity?: string; method: Method };
  workspacePath: string;
  platform: NodeJS.Platform;
  shell: 'bash' | 'powershell';
  language: string;
  sections: readonly Section[];
  /** "Decide for me" (ADR 0092, 2): the lead makes each choice itself. */
  decides?: boolean;
  /** The worker a subagent runs for: its instructions follow the sections (ADR 0021, 8). */
  worker?: { name: string; instructions: string; readOnly?: boolean };
  connectors: readonly { name: string; description: string; commands: readonly string[]; signatures?: readonly string[] }[];
};

export type BuiltPrompt = { prompt: string; included: ReadonlySet<Section>; left: readonly Section[] };

const systems: Partial<Record<NodeJS.Platform, string>> = { linux: 'Linux', darwin: 'macOS', win32: 'Windows' };

function languageName(code: string): string {
  const name = new Intl.DisplayNames(['en'], { type: 'language' }).of(code);
  return name === undefined || name === code ? code : `${name} (${code})`;
}

/** The method's last line in a chat set to "Decide for me" (ADR 0092, 2). */
export const decideLine = 'The person asked you to decide in this chat: make each choice yourself, the one you would recommend, say in a line what you chose and why, and go on. Approvals still ask.';

// The base prompt (ADR 0009, 163 and 166; ADR 0011, 1; ADR 0022; ADR 0089, 1): who the agent is, its one tool, connectors, and how it works.
function basePrompt(input: PromptInput): string {
  const shell = input.shell === 'bash' ? 'bash' : 'PowerShell';
  const identity = [
    identityLine(input.role, `in the folder ${input.workspacePath} on ${systems[input.platform] ?? input.platform}`, input.profile?.identity),
    `Reply in ${languageName(input.language)} unless the person writes in another language.`,
    'Each message from the person starts with the date and time it was sent, in brackets; the newest one is the current time.',
  ].join('\n');
  const tool = 'Your one tool is run: it runs one command of a connector, as { connector, command, payload }. Below, `fs write` means the connector fs and its command write.';
  const connectors = `Connectors are the only way you act. When a connector other than shell covers a task, use it instead of a shell line: it checks its input, returns structured results, and is shown to the person. Use shell only for what no other connector does. Every connector has the command help. A command listed below with its payload needs no help call; for any other command, or for what a field means, call the connector's help with { "command": "<name>" } before the first use. \`shell exec\`, \`fs write\`, \`fs edit\`, \`mcp call\`, and \`mcp run\` take risky, which you always send and judge for each call from what the call does, not from which command it is. It is false for the ordinary work of the task: creating, editing, or rewriting a file inside the workspace folder that the task needs, whoever made it and whether or not the repository has uncommitted changes (\`fs undo\` takes such a change back, so a change to a file is never risky by itself), running the project's own build, tests, and tools, and a tool that only reads. It is true, and the person is then asked first, only when the call could do what is hard to take back or reaches past the task: anything outside the workspace folder; deleting files, or overwriting them with a shell line; a file that holds secrets, such as .env or a key; rewriting or discarding git history or uncommitted work (push --force, git reset, checkout, restore, stash drop, clean); sudo, or an install outside the project; sending something out (a push, a publish, a deploy, a message, a write to a remote service); and the Commands section of AGENTS.md. When you can't tell whether a call can be taken back, it is true. Each \`shell exec\` starts in the workspace folder, so cd doesn't carry over to the next call; the shell is ${shell}.`;
  const method = workingMethod(input.role, input.profile?.method);
  return [identity, tool, connectors, input.decides === true && input.role === 'lead' ? `${method}\n${decideLine}` : method].join('\n\n');
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

/** What a read-only worker's helper is told (ADR 0056, 4). */
const readOnlyNote = 'You are read-only here: you read and search, and you report your findings in your answer. A call that could change something is refused, so don\'t make one; say what should change and why.';

export function buildPrompt(input: PromptInput): BuiltPrompt {
  const { kept, left } = keptSections(input.sections);
  const parts = [basePrompt(input), ...kept.map((section) => `## ${section.title}\n${section.content}`)];
  if (input.worker !== undefined && input.worker.instructions !== '') parts.push(`## Worker: ${input.worker.name}\n${input.worker.instructions}`);
  if (input.worker?.readOnly === true) parts.push(readOnlyNote);
  if (input.connectors.length > 0) parts.push(['## Connectors', ...input.connectors.map(connectorLine)].join('\n'));
  return { prompt: parts.join('\n\n'), included: new Set(kept), left };
}
