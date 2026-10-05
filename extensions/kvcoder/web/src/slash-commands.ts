// The send box's slash commands (plan 08 §8.7, ADR 0017, 6 and 11): the open chat's own actions, by name. A text that
// is one line and starts with `/` is a command; the list shows the ones whose name starts with what is typed.

export const slashCommands = [{ name: 'compact' }, { name: 'export' }, { name: 'fork' }, { name: 'new' }, { name: 'prompt' }, { name: 'rename', argument: true }] as const;

export type SlashCommand = (typeof slashCommands)[number];
export type SlashName = SlashCommand['name'];

export type Typed = { word: string; argument: string; named: boolean };

/** What a text names as a command: its word, what follows it, and whether the word is finished (a space came after it). */
export function typedCommand(text: string): Typed | undefined {
  const match = /^\/(\S*)(\s+(.*))?$/.exec(text);
  if (match === null || text.includes('\n')) return undefined;
  return { word: match[1] ?? '', argument: (match[3] ?? '').trim(), named: match[2] !== undefined };
}

/** The commands a typed word may mean: the one of that name once the word is finished, else those that start with it. */
export function matchingCommands(typed: Typed): SlashCommand[] {
  return slashCommands.filter((command) => (typed.named ? command.name === typed.word : command.name.startsWith(typed.word)));
}
