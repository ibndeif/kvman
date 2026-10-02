import type { Section } from '../registry/register-sections.ts';
import { sectionsLimit } from '../registry/register-sections.ts';

// The system prompt (plan 08 §8.2): the base prompt, the sections by `order`, then the connector index. Sections past
// 64 KB together are left out, last by `order` first (ADR 0009, 94).

export type PromptInput = {
  workspacePath: string;
  platform: NodeJS.Platform;
  toolName: 'bash' | 'powershell';
  language: string;
  sections: readonly Section[];
  connectors: readonly { name: string; description: string }[];
};

export type BuiltPrompt = { prompt: string; included: ReadonlySet<Section>; left: readonly Section[] };

const systems: Partial<Record<NodeJS.Platform, string>> = { linux: 'Linux', darwin: 'macOS', win32: 'Windows' };

function languageName(code: string): string {
  const name = new Intl.DisplayNames(['en'], { type: 'language' }).of(code);
  return name === undefined || name === code ? code : `${name} (${code})`;
}

function basePrompt(input: PromptInput): string {
  const shell = input.toolName === 'bash' ? 'bash' : 'PowerShell';
  return [
    `You are kvman Coder, an agent that builds software with the person, in the folder ${input.workspacePath} on ${systems[input.platform] ?? input.platform}.`,
    `Reply in ${languageName(input.language)} unless the person writes in another language.`,
    `Your one tool is ${input.toolName}: it runs a ${shell} command. Each call starts in the workspace folder, so cd doesn't carry over to the next call.`,
    'Some words are connectors, which kvcoder runs itself: `<connector> <command> \'<json>\'`, or the JSON on stdin (a heredoc in bash, a here-string in PowerShell). A connector call stands alone on its line. Add --async to run it in the background: it prints the job id at once, and the result arrives later as a message. Run `<connector> -h` to see what a connector does.',
    'To put a question to the person (a choice, a yes or no, a free answer), call `ask`. A reply with no tool call ends your turn, so never end one by promising something still to come ("now the question:"): make the call in the same reply, or say what you need.',
  ].join('\n');
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
  if (input.connectors.length > 0) parts.push(['## Connectors', ...input.connectors.map((connector) => `- ${connector.name}: ${connector.description}`)].join('\n'));
  return { prompt: parts.join('\n\n'), included: new Set(kept), left };
}
