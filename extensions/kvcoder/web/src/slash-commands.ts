// The send box's slash commands (plan 08 §8.7, ADR 0017, 6 and 11): the open chat's own actions, by name, then the
// commands that extensions registered (ADR 0027, 9). A text that is one line and starts with `/` is a command; the list
// shows the ones whose name starts with what is typed.

export const slashCommands = [{ name: 'compact' }, { name: 'export' }, { name: 'fork' }, { name: 'new' }, { name: 'prompt' }, { name: 'rename', argument: true }] as const;

export type SlashCommand = (typeof slashCommands)[number];
export type SlashName = SlashCommand['name'];

/** A slash command an extension registered (plan 08 §8.4): `description` and `message` are translation keys. */
export type RegisteredSlash = { name: string; description: string; command: string; message?: string; owner: string };

/** A row of the list: one of kvcoder's own commands, or a registered one. */
export type ListedSlash = { kind: 'own'; command: SlashCommand } | { kind: 'registered'; command: RegisteredSlash };

export type Typed = { word: string; argument: string; named: boolean };

/** What a text names as a command: its word, what follows it, and whether the word is finished (a space came after it). */
export function typedCommand(text: string): Typed | undefined {
  const match = /^\/(\S*)(\s+(.*))?$/.exec(text);
  if (match === null || text.includes('\n')) return undefined;
  return { word: match[1] ?? '', argument: (match[3] ?? '').trim(), named: match[2] !== undefined };
}

/** The commands a typed word may mean, kvcoder's own first: the one of that name once the word is finished, else those that start with it. */
export function matchingCommands(typed: Typed, registered: readonly RegisteredSlash[]): ListedSlash[] {
  const matches = (name: string): boolean => (typed.named ? name === typed.word : name.startsWith(typed.word));
  return [
    ...slashCommands.filter((command) => matches(command.name)).map((command) => ({ kind: 'own' as const, command })),
    ...registered.filter((command) => matches(command.name)).map((command) => ({ kind: 'registered' as const, command })),
  ];
}
