import { runResult, runStatusText, searchResult } from './call-results.ts';
import type { CallView } from './call-view.ts';
import { diffCounts, diffLines, textLines } from './edit-diff.ts';
import { fields, type Translate } from './kvman.ts';
import { mcpSteps } from './mcp-steps.ts';

// A closed card's second line (ADR 0036, 2): what the call did, to what, and the outcome its result gives. A call
// with no line of its own here keeps `connector · command`.

export type CallSummary = { words?: string; subject?: string; outcome?: string };

/** A JSON output parsed, or nothing when it isn't JSON. */
export function parsedOutput(output: string | undefined): unknown {
  if (output === undefined || !/^\s*[[{]/.test(output)) return undefined;
  try {
    const parsed: unknown = JSON.parse(output);
    return parsed;
  } catch (error) {
    if (error instanceof SyntaxError) return undefined;
    throw error;
  }
}

const kilobyte = 1024;

/** A size in the unit that fits: bytes, then KB and MB with one decimal. */
export function sizeText(t: Translate, bytes: number): string {
  if (bytes < kilobyte) return t('kvcoder.ui.call.bytes', { count: bytes });
  if (bytes < kilobyte * kilobyte) return t('kvcoder.ui.call.kilobytes', { count: (bytes / kilobyte).toFixed(1) });
  return t('kvcoder.ui.call.megabytes', { count: (bytes / (kilobyte * kilobyte)).toFixed(1) });
}

const text = (value: unknown): string | undefined => (typeof value === 'string' && value !== '' ? value : undefined);

/** The pairs of texts an `fs edit` or an approval of one replaces. */
export function editsOf(payload: Record<string, unknown>): { oldText: string; newText: string }[] {
  const edits: unknown = payload['edits'];
  if (!Array.isArray(edits)) return [];
  return edits.flatMap((edit: unknown) => {
    const { oldText, newText } = fields(edit);
    return typeof oldText === 'string' && typeof newText === 'string' ? [{ oldText, newText }] : [];
  });
}

function changedText(payload: Record<string, unknown>): string {
  const counts = editsOf(payload).map((edit) => diffCounts(diffLines(edit.oldText, edit.newText)));
  return `+${counts.reduce((sum, count) => sum + count.added, 0)} −${counts.reduce((sum, count) => sum + count.removed, 0)}`;
}

function writtenText(t: Translate, result: Record<string, unknown>): string | undefined {
  if (typeof result['bytes'] !== 'number' || typeof result['created'] !== 'boolean') return undefined;
  return t(result['created'] ? 'kvcoder.ui.call.created' : 'kvcoder.ui.call.replaced', { size: sizeText(t, result['bytes']) });
}

function linesText(t: Translate, result: Record<string, unknown>): string | undefined {
  const { fromLine, totalLines, content } = result;
  if (typeof fromLine !== 'number' || typeof totalLines !== 'number' || typeof content !== 'string') return undefined;
  const count = textLines(content).length;
  return count === 0 ? undefined : t('kvcoder.ui.call.lines', { from: fromLine, to: fromLine + count - 1, total: totalLines });
}

function entriesText(t: Translate, result: Record<string, unknown>): string | undefined {
  const entries: unknown = result['entries'];
  if (!Array.isArray(entries)) return undefined;
  return t(result['truncated'] === true ? 'kvcoder.ui.call.entriesFirst' : 'kvcoder.ui.call.entries', { count: entries.length });
}

function pathsText(t: Translate, result: Record<string, unknown>): string | undefined {
  const paths: unknown = result['paths'];
  if (!Array.isArray(paths)) return undefined;
  return t(result['truncated'] === true ? 'kvcoder.ui.call.filesFirst' : 'kvcoder.ui.call.files', { count: paths.length });
}

// Lines shown around a match aren't matches; a file of `filesOnly` gives its count (ADR 0090, 3).
function matchesText(t: Translate, result: Record<string, unknown>): string | undefined {
  const files = searchResult(result);
  if (files === undefined) return undefined;
  const matches = files.reduce((sum, file) => sum + file.count, 0);
  return t(result['truncated'] === true ? 'kvcoder.ui.call.matchesFirst' : 'kvcoder.ui.call.matches', { matches, files: files.length });
}

const countText = (t: Translate, key: string, items: unknown): string | undefined => (Array.isArray(items) ? t(key, { count: items.length }) : undefined);

function summary(words: string | undefined, subject: string | undefined, outcome?: string): CallSummary {
  return { ...(words === undefined ? {} : { words }), ...(subject === undefined ? {} : { subject }), ...(outcome === undefined ? {} : { outcome }) };
}

function fsSummary(t: Translate, command: string, payload: Record<string, unknown>, result: unknown): CallSummary | undefined {
  const done = result === undefined ? undefined : fields(result);
  const path = text(payload['path']);
  if (command === 'edit') return summary(t('kvcoder.ui.call.edit'), path, done === undefined ? undefined : changedText(payload));
  if (command === 'write') return summary(t('kvcoder.ui.call.write'), path, done === undefined ? undefined : writtenText(t, done));
  if (command === 'read') return summary(t('kvcoder.ui.call.read'), path, done === undefined ? undefined : linesText(t, done));
  if (command === 'list') return summary(t('kvcoder.ui.call.list'), path ?? '.', done === undefined ? undefined : entriesText(t, done));
  if (command === 'find') return summary(t('kvcoder.ui.call.find'), text(payload['pattern']), done === undefined ? undefined : pathsText(t, done));
  if (command === 'search') return summary(t('kvcoder.ui.call.search'), text(payload['pattern']), done === undefined ? undefined : matchesText(t, done));
  return undefined;
}

function mcpSummary(t: Translate, command: string, payload: Record<string, unknown>, result: unknown): CallSummary | undefined {
  const server = text(payload['server']);
  const tool = text(payload['tool']);
  const subject = [server, tool].filter((part) => part !== undefined).join(' · ');
  if (command === 'call') return summary(undefined, subject === '' ? undefined : subject);
  if (command === 'run') {
    const tools = mcpSteps(payload).flatMap((step) => (step.tool === undefined ? [] : [step.tool]));
    return summary(undefined, [server, tools.join(', ')].filter((part) => part !== undefined && part !== '').join(' · '));
  }
  if (command === 'tools') return summary(t('kvcoder.ui.call.tools'), subject === '' ? undefined : subject, countText(t, 'kvcoder.ui.call.toolCount', fields(result)['tools']));
  return undefined;
}

function backgroundSummary(t: Translate, command: string, payload: Record<string, unknown>, result: unknown): CallSummary | undefined {
  if (command === 'list') return summary(t('kvcoder.ui.call.backgroundRuns'), undefined, countText(t, 'kvcoder.ui.call.runCount', result));
  if (command === 'output' || command === 'wait') {
    const run = runResult(result);
    return summary(t(`kvcoder.ui.call.${command}`), text(payload['id']), run === undefined ? undefined : runStatusText(t, run.status));
  }
  if (command === 'stop') return summary(t('kvcoder.ui.call.stop'), text(payload['id']));
  return undefined;
}

// The execution map's calls (ADR 0064): what was planned or changed, and how far the work is.
function mapSummary(t: Translate, command: string, payload: Record<string, unknown>, result: unknown): CallSummary | undefined {
  const progress = text(fields(result)['progress']);
  const steps: unknown = payload['steps'];
  const ids = Array.isArray(steps) ? steps.flatMap((step: unknown) => (text(fields(step)['id']) === undefined ? [] : [String(fields(step)['id'])])).join(', ') : undefined;
  if (command === 'set') return summary(t('kvcoder.ui.call.mapSet'), text(payload['goal']), progress);
  if (command === 'detail') return summary(t('kvcoder.ui.call.mapDetail'), text(payload['id']), progress);
  if (command === 'update') return summary(t('kvcoder.ui.call.mapUpdate'), ids === '' ? undefined : ids, progress);
  if (command === 'note') return summary(t('kvcoder.ui.call.mapNote'), text(payload['text']));
  return command === 'get' ? summary(t('kvcoder.ui.call.mapGet'), undefined, progress) : undefined;
}

/** A call's closed line, or nothing for a call that keeps `connector · command`. `result` is the parsed output of a call that succeeded. */
export function callSummary(t: Translate, view: CallView, result?: unknown): CallSummary | undefined {
  const { connector, command } = view;
  const payload = view.fields ?? {};
  if (connector === undefined || command === undefined) return undefined;
  if (view.line !== undefined) return { subject: `$ ${view.line}` };
  if (command === 'help') return summary(t('kvcoder.ui.call.help'), [connector, text(payload['command'])].filter((part) => part !== undefined).join(' '));
  if (connector === 'fs') return fsSummary(t, command, payload, result);
  if (connector === 'mcp') return mcpSummary(t, command, payload, result);
  if (connector === 'background') return backgroundSummary(t, command, payload, result);
  if (connector === 'execution-map') return mapSummary(t, command, payload, result);
  if (connector === 'delegate' && command === 'run') return summary(t('kvcoder.ui.call.delegate'), [text(payload['worker']), text(payload['title'])].filter((part) => part !== undefined).join(' · '));
  if (connector === 'artifact' && command === 'get') return summary(t('kvcoder.ui.call.readArtifact'), text(payload['id']));
  if (connector === 'web' && command === 'fetch') return summary(t('kvcoder.ui.call.fetch'), text(payload['url']));
  // A call names what it does from itself (ADR 0089, 1).
  if (connector === 'artifact' && (command === 'write' || command === 'edit')) return summary(t(`kvcoder.ui.call.${command}Artifact`), text(payload['id']));
  return undefined;
}
