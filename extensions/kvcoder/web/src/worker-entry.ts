import { thinkingLevels, type Thinking } from './model-groups.ts';

// A worker as kvcoder's configuration edits it (plan 08 §8.5 and §8.7, ADR 0021, 7, 13, 20, and 38): an entry of
// `kvcoder.delegate.workers`, and the form's draft of one. A worker runs a subagent, or a program on this computer.

type Common = { name: string; description: string; enabled: boolean; instructions: string };
type Program = Common & { approval: 'ask' | 'auto'; timeoutMs: number };

export const piThinking = ['off', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max'] as const;
export const claudeEffort = ['low', 'medium', 'high', 'xhigh', 'max'] as const;
export const permissionModes = ['acceptEdits', 'auto', 'bypassPermissions', 'dontAsk', 'plan'] as const;
export const workerKinds = ['subagent', 'opencode', 'pi', 'claude'] as const;

export type SubagentEntry = Common & { kind: 'subagent'; connectors: string[] | null; model: string | null; thinking: Thinking | null };
export type OpencodeEntry = Program & { kind: 'opencode'; model: string | null; agent: string | null; autoApprove: boolean };
export type PiEntry = Program & { kind: 'pi'; model: string | null; thinking: (typeof piThinking)[number] | null; tools: string[] | null };
export type ClaudeEntry = Program & { kind: 'claude'; model: string | null; effort: (typeof claudeEffort)[number] | null; permissionMode: (typeof permissionModes)[number] };
export type WorkerEntry = SubagentEntry | OpencodeEntry | PiEntry | ClaudeEntry;
export type WorkerKind = WorkerEntry['kind'];

const strings = (value: unknown): value is string[] => Array.isArray(value) && value.every((item) => typeof item === 'string');
const text = (value: unknown): value is string | null => value === null || typeof value === 'string';
const among = <Option extends string>(options: readonly Option[], value: unknown): value is Option => options.some((option) => option === value);
const has = <Key extends string>(value: object, ...keys: Key[]): value is Record<Key, unknown> => keys.every((key) => key in value);

function isEntry(value: unknown): value is WorkerEntry {
  if (typeof value !== 'object' || value === null || !has(value, 'name', 'description', 'enabled', 'kind', 'instructions')) return false;
  if (typeof value.name !== 'string' || typeof value.description !== 'string' || typeof value.enabled !== 'boolean' || typeof value.instructions !== 'string') return false;
  if (value.kind === 'subagent') return has(value, 'connectors', 'model', 'thinking') && (value.connectors === null || strings(value.connectors)) && text(value.model) && (value.thinking === null || among(thinkingLevels, value.thinking));
  if (!has(value, 'approval', 'timeoutMs', 'model') || !among(['ask', 'auto'], value.approval) || typeof value.timeoutMs !== 'number' || !text(value.model)) return false;
  if (value.kind === 'opencode') return has(value, 'agent', 'autoApprove') && text(value.agent) && typeof value.autoApprove === 'boolean';
  if (value.kind === 'pi') return has(value, 'thinking', 'tools') && (value.thinking === null || among(piThinking, value.thinking)) && (value.tools === null || strings(value.tools));
  return value.kind === 'claude' && has(value, 'effort', 'permissionMode') && (value.effort === null || among(claudeEffort, value.effort)) && among(permissionModes, value.permissionMode);
}

/** The workers of the setting's value. */
export const workerEntries = (value: unknown): WorkerEntry[] => (Array.isArray(value) ? value.filter(isEntry) : []);

// The form's draft holds every kind's fields, so switching the kind loses nothing typed: `all` stands for every
// connector, and an empty text or choice for the chat's own or the program's default.
export type WorkerDraft = Common & {
  kind: WorkerKind;
  all: boolean;
  connectors: string[];
  model: string | null;
  thinking: Thinking | '';
  approval: 'ask' | 'auto';
  minutes: string;
  programModel: string;
  agent: string;
  autoApprove: boolean;
  piThinking: (typeof piThinking)[number] | '';
  tools: string;
  effort: (typeof claudeEffort)[number] | '';
  permissionMode: (typeof permissionModes)[number];
};

const blank: WorkerDraft = { name: '', description: '', enabled: true, instructions: '', kind: 'subagent', all: true, connectors: [], model: null, thinking: '', approval: 'ask', minutes: '30', programModel: '', agent: '', autoApprove: true, piThinking: '', tools: '', effort: '', permissionMode: 'acceptEdits' };

/** The form's draft of a worker, or an empty one for a new worker. */
export function draftOf(entry: WorkerEntry | undefined): WorkerDraft {
  if (entry === undefined) return { ...blank };
  const common = { ...blank, name: entry.name, description: entry.description, enabled: entry.enabled, instructions: entry.instructions };
  if (entry.kind === 'subagent') return { ...common, kind: 'subagent', all: entry.connectors === null, connectors: [...(entry.connectors ?? [])], model: entry.model, thinking: entry.thinking ?? '' };
  const program = { ...common, approval: entry.approval, minutes: String(entry.timeoutMs / 60_000), programModel: entry.model ?? '' };
  if (entry.kind === 'opencode') return { ...program, kind: 'opencode', agent: entry.agent ?? '', autoApprove: entry.autoApprove };
  if (entry.kind === 'pi') return { ...program, kind: 'pi', piThinking: entry.thinking ?? '', tools: (entry.tools ?? []).join('\n') };
  return { ...program, kind: 'claude', effort: entry.effort ?? '', permissionMode: entry.permissionMode };
}

const orNull = <Value extends string>(value: Value | ''): Value | null => (value === '' ? null : value);

/** The entry a draft stands for; a subagent's connectors keep the order of `offered`. */
export function entryOf(draft: WorkerDraft, offered: readonly string[]): WorkerEntry {
  const common = { name: draft.name.trim(), description: draft.description.trim(), enabled: draft.enabled, instructions: draft.instructions };
  if (draft.kind === 'subagent') {
    const connectors = draft.all ? null : [...offered.filter((name) => draft.connectors.includes(name)), ...draft.connectors.filter((name) => !offered.includes(name))];
    return { ...common, kind: 'subagent', connectors, model: draft.model, thinking: orNull(draft.thinking) };
  }
  const program = { ...common, approval: draft.approval, timeoutMs: Number(draft.minutes) * 60_000, model: orNull(draft.programModel.trim()) };
  if (draft.kind === 'opencode') return { ...program, kind: 'opencode', agent: orNull(draft.agent.trim()), autoApprove: draft.autoApprove };
  const tools = draft.tools.split('\n').map((tool) => tool.trim()).filter((tool) => tool !== '');
  if (draft.kind === 'pi') return { ...program, kind: 'pi', thinking: orNull(draft.piThinking), tools: tools.length === 0 ? null : tools };
  return { ...program, kind: 'claude', effort: orNull(draft.effort), permissionMode: draft.permissionMode };
}

// The server's own rules (`src/delegate/workers.ts`), so a mistake shows under its field before anything is written.
const namePattern = /^[a-z][a-z0-9]*(-[a-z0-9]+)*$/;
const instructionsLimit = 16 * 1024;
const wholeMinutes = /^(?:[1-9]|[1-9]\d|1[01]\d|120)$/;

export type DraftField = 'name' | 'description' | 'instructions' | 'connectors' | 'minutes';

/** What is wrong with a draft, as a translation key per field; `taken` are the other workers' names. */
export function draftProblems(draft: WorkerDraft, taken: readonly string[]): Partial<Record<DraftField, string>> {
  const name = draft.name.trim();
  const problems: Partial<Record<DraftField, string>> = {};
  if (name === '') problems.name = 'kvcoder.config.workers.invalid.nameEmpty';
  else if (!namePattern.test(name)) problems.name = 'kvcoder.config.workers.invalid.nameShape';
  else if (taken.includes(name)) problems.name = 'kvcoder.config.workers.invalid.nameTaken';
  if (draft.description.trim() === '') problems.description = 'kvcoder.config.workers.invalid.descriptionEmpty';
  if (new TextEncoder().encode(draft.instructions).length > instructionsLimit) problems.instructions = 'kvcoder.config.workers.invalid.instructionsLong';
  if (draft.kind === 'subagent' && !draft.all && draft.connectors.length === 0) problems.connectors = 'kvcoder.config.workers.invalid.connectorsEmpty';
  if (draft.kind !== 'subagent' && !wholeMinutes.test(draft.minutes.trim())) problems.minutes = 'kvcoder.config.workers.invalid.minutes';
  return problems;
}
