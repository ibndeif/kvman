// An MCP server as kvcoder's configuration edits it (plan 08 §8.5 and §8.7, ADR 0020, 6 and 15): an entry of
// `kvcoder.mcp.servers`, the form's draft of one, and the names of the secrets that hold its values.

export type CommandServer = { name: string; description: string; command: string; args: string[]; env: string[] };
export type UrlServer = { name: string; description: string; url: string; headers: string[] };
export type McpServerEntry = CommandServer | UrlServer;

/** The package whose secrets hold a server's values. */
export const kvcoderPackage = '@kvman/kvcoder';

const strings = (value: unknown): value is string[] => Array.isArray(value) && value.every((item) => typeof item === 'string');

function isEntry(value: unknown): value is McpServerEntry {
  if (typeof value !== 'object' || value === null || !('name' in value) || !('description' in value)) return false;
  if (typeof value.name !== 'string' || typeof value.description !== 'string') return false;
  if ('command' in value) return typeof value.command === 'string' && 'args' in value && strings(value.args) && 'env' in value && strings(value.env);
  return 'url' in value && typeof value.url === 'string' && 'headers' in value && strings(value.headers);
}

/** The servers of the setting's value. */
export const serverEntries = (value: unknown): McpServerEntry[] => (Array.isArray(value) ? value.filter(isEntry) : []);

export type ValueKind = 'env' | 'header';

/** The secret that holds one variable's or header's value. */
export const secretName = (server: string, kind: ValueKind, name: string): string => `mcp.${server}.${kind}.${name}`;

/** Every secret of a server starts with this. */
export const secretPrefix = (server: string): string => `mcp.${server}.`;

/** A variable or header in the form: `set` when its secret exists, and `value` what the person typed for a new or replaced one. */
export type DraftValue = { name: string; value: string; set: boolean; replacing: boolean };

export type ServerDraft = { name: string; description: string; kind: 'command' | 'url'; command: string; args: string; url: string; values: DraftValue[] };

export const kindOf = (draft: Pick<ServerDraft, 'kind'>): ValueKind => (draft.kind === 'command' ? 'env' : 'header');

/** The form's draft of a server, or an empty one for a new server. */
export function draftOf(entry: McpServerEntry | undefined, secrets: readonly string[]): ServerDraft {
  if (entry === undefined) return { name: '', description: '', kind: 'command', command: '', args: '', url: '', values: [] };
  const [kind, names] = 'command' in entry ? (['env', entry.env] as const) : (['header', entry.headers] as const);
  const values = names.map((name) => ({ name, value: '', set: secrets.includes(secretName(entry.name, kind, name)), replacing: false }));
  if ('command' in entry) return { name: entry.name, description: entry.description, kind: 'command', command: entry.command, args: entry.args.join('\n'), url: '', values };
  return { name: entry.name, description: entry.description, kind: 'url', command: '', args: '', url: entry.url, values };
}

/** The entry a draft stands for. */
export function entryOf(draft: ServerDraft): McpServerEntry {
  const base = { name: draft.name.trim(), description: draft.description.trim() };
  const names = draft.values.map((value) => value.name.trim());
  if (draft.kind === 'url') return { ...base, url: draft.url.trim(), headers: names };
  return { ...base, command: draft.command.trim(), args: draft.args.split('\n').filter((line) => line !== ''), env: names };
}

// The server's own rules (`src/mcp/servers.ts`), so a mistake shows under its field before anything is written.
const namePattern = /^[a-z][a-z0-9]*(-[a-z0-9]+)*$/;
const valueNames: Record<ValueKind, RegExp> = { env: /^[A-Za-z_][A-Za-z0-9_]*$/, header: /^[A-Za-z0-9!#$%&'*+.^_`|~-]+$/ };

const isHttpAddress = (value: string): boolean => URL.canParse(value) && ['http:', 'https:'].includes(new URL(value).protocol);

export type DraftField = 'name' | 'description' | 'command' | 'url' | 'values';

function valuesProblem(draft: ServerDraft): string | undefined {
  const kind = kindOf(draft);
  const names = draft.values.map((value) => value.name.trim());
  if (names.some((name) => !valueNames[kind].test(name))) return `kvcoder.config.mcp.invalid.valueName.${kind}`;
  if (new Set(names).size !== names.length) return 'kvcoder.config.mcp.invalid.valueRepeated';
  return draft.values.some((value) => (!value.set || value.replacing) && value.value === '') ? 'kvcoder.config.mcp.invalid.valueEmpty' : undefined;
}

/** What is wrong with a draft, as a translation key per field; `taken` are the other servers' names. */
export function draftProblems(draft: ServerDraft, taken: readonly string[]): Partial<Record<DraftField, string>> {
  const name = draft.name.trim();
  const problems: Partial<Record<DraftField, string>> = {};
  if (name === '') problems.name = 'kvcoder.config.mcp.invalid.nameEmpty';
  else if (!namePattern.test(name)) problems.name = 'kvcoder.config.mcp.invalid.nameShape';
  else if (taken.includes(name)) problems.name = 'kvcoder.config.mcp.invalid.nameTaken';
  if (draft.description.trim() === '') problems.description = 'kvcoder.config.mcp.invalid.descriptionEmpty';
  if (draft.kind === 'command' && draft.command.trim() === '') problems.command = 'kvcoder.config.mcp.invalid.commandEmpty';
  if (draft.kind === 'url' && !isHttpAddress(draft.url.trim())) problems.url = 'kvcoder.config.mcp.invalid.url';
  const values = valuesProblem(draft);
  if (values !== undefined) problems.values = values;
  return problems;
}

/** What saving a draft changes in the secrets: the values to set, by secret name, and the secrets to delete. */
export function secretChanges(draft: ServerDraft, original: McpServerEntry | undefined, secrets: readonly string[]): { set: Record<string, string>; remove: string[] } {
  const server = draft.name.trim();
  const kind = kindOf(draft);
  const kept = new Set(draft.values.map((value) => secretName(server, kind, value.name.trim())));
  const set = Object.fromEntries(draft.values.filter((value) => !value.set || value.replacing).map((value) => [secretName(server, kind, value.name.trim()), value.value]));
  const before = original === undefined ? [] : secrets.filter((name) => name.startsWith(`${secretPrefix(server)}env.`) || name.startsWith(`${secretPrefix(server)}header.`));
  return { set, remove: before.filter((name) => !kept.has(name)) };
}
