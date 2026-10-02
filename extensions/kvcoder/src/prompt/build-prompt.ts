import type { Section } from '../registry/register-sections.ts';
import { sectionsLimit } from '../registry/register-sections.ts';

// The system prompt (plan 08 §8.2): the base prompt, the sections by `order`, then the connector index under its lead
// line. Sections past 64 KB together are left out, last by `order` first (ADR 0009, 94).

export type PromptInput = {
  workspacePath: string;
  platform: NodeJS.Platform;
  toolName: 'bash' | 'powershell';
  language: string;
  sections: readonly Section[];
  connectors: readonly { name: string; description: string; kind: 'commands' | 'binary' | 'builtin' }[];
};

export type BuiltPrompt = { prompt: string; included: ReadonlySet<Section>; left: readonly Section[] };

const systems: Partial<Record<NodeJS.Platform, string>> = { linux: 'Linux', darwin: 'macOS', win32: 'Windows' };

function languageName(code: string): string {
  const name = new Intl.DisplayNames(['en'], { type: 'language' }).of(code);
  return name === undefined || name === code ? code : `${name} (${code})`;
}

const connectorsFirst =
  'Connectors come first. A connector is a word kvcoder runs itself: `<connector> <command> \'<json>\'`, or the JSON on stdin (a heredoc in bash, a here-string in PowerShell), alone on its line. When a connector covers a task, use it instead of doing the same through the shell: it checks its input, returns structured results, and is tracked for the person. Use the shell only for what no connector does. Run `<connector> -h` to see what one does. Add --async to run it in the background: it prints the job id at once, and the result arrives later as a message.';

const howYouWork = [
  'How you work:',
  '- Look before you change: read the files first, then make the smallest change that does the job.',
  '- Check your work with the project\'s own check or tests before you say it is done.',
  '- The calls of one reply run at the same time, so put calls that depend on each other in separate replies.',
  '- To put a question to the person (a choice, a yes or no, a free answer), call `ask`. A reply with no tool call ends your turn, so never end one by promising something still to come ("now the question:"): make the call in the same reply, or say what you need.',
  '- Keep replies short: say what you did and what is left.',
].join('\n');

// The base prompt (ADR 0009, 163 and 166 to 168): who the agent is, its one tool, connectors first, and how it works.
function basePrompt(input: PromptInput): string {
  const shell = input.toolName === 'bash' ? 'bash' : 'PowerShell';
  const identity = [
    `You are kvman Coder, an agent that builds software with the person, in the folder ${input.workspacePath} on ${systems[input.platform] ?? input.platform}.`,
    `Reply in ${languageName(input.language)} unless the person writes in another language.`,
  ].join('\n');
  const tool = `Your one tool is ${input.toolName}: it runs a ${shell} command. Each call starts in the workspace folder, so cd doesn't carry over to the next call.`;
  return [identity, tool, connectorsFirst, howYouWork].join('\n\n');
}

const connectorsLead = 'Use these before the shell, whenever one covers the task.';

// A connector's entry: its owner's description, then how to get its help (ADR 0009, 164).
function connectorLine(connector: PromptInput['connectors'][number]): string {
  const description = /[.!?)]$/.test(connector.description.trimEnd()) ? connector.description.trimEnd() : `${connector.description.trimEnd()}.`;
  const name = connector.name;
  const help = connector.kind === 'commands' ? `Help: \`${name} -h\` lists its commands; \`${name} <command> -h\` shows a command's input, output, and examples.` : `Help: \`${name} -h\`.`;
  return `- ${name}: ${description} ${help}`;
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
  if (input.connectors.length > 0) parts.push(['## Connectors', connectorsLead, ...input.connectors.map(connectorLine)].join('\n'));
  return { prompt: parts.join('\n\n'), included: new Set(kept), left };
}
