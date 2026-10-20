import { z } from '@kvman/sdk';

// How a read and an edit read to the model (plan 08 §8.5, ADR 0097, 2): a header, then each line as `cat -n` prints
// it, its number right-aligned to six places, a tab, and its text. The call's `details` keep the JSON.

const numberWidth = 6;

/** One line as a read shows it: its number, a tab, and its text without the line ending. */
export const numberedLine = (number: number, line: string): string => `${String(number).padStart(numberWidth)}\t${line.replace(/\r?\n$/, '')}`;

/** A text's lines, each with its line ending. */
export const linesOf = (content: string): string[] => content.match(/[^\n]*\n|[^\n]+$/g) ?? [];

/** Text numbered from `fromLine`. */
export const numberedLines = (content: string, fromLine: number): string => linesOf(content).map((line, index) => numberedLine(fromLine + index, line)).join('\n');

export const fileReadSchema = z.object({ path: z.string(), fromLine: z.number().int(), totalLines: z.number().int(), content: z.string(), truncated: z.boolean(), next: z.object({ fromLine: z.number().int(), fromColumn: z.number().int().exactOptional() }).exactOptional() });

export type FileReadValue = z.output<typeof fileReadSchema>;

const linesWord = (count: number): string => `${String(count)} ${count === 1 ? 'line' : 'lines'}`;

function readOn(next: FileReadValue['next']): string {
  if (next === undefined) return '';
  return ` · read on with fromLine ${String(next.fromLine)}${next.fromColumn === undefined ? '' : `, fromColumn ${String(next.fromColumn)}`}`;
}

/** A file's read as the model reads it; `fromColumn` is where the read started in its first line. */
export function readText(read: FileReadValue, fromColumn = 1): string {
  if (read.totalLines === 0) return `${read.path} · empty (0 lines)`;
  const count = linesOf(read.content).length;
  if (count === 0) return `${read.path} · no lines from line ${String(read.fromLine)}: the file has ${linesWord(read.totalLines)}`;
  const last = read.fromLine + count - 1;
  const range = count === 1 ? `line ${String(read.fromLine)} of ${String(read.totalLines)}` : `lines ${String(read.fromLine)}–${String(last)} of ${String(read.totalLines)}`;
  const column = fromColumn > 1 ? ` (line ${String(read.fromLine)} from character ${String(fromColumn)})` : '';
  return `${read.path} · ${range}${column}${readOn(read.next)}\n${numberedLines(read.content, read.fromLine)}`;
}

/** What a read of lines the chat already holds reads instead (ADR 0034, 2). */
export const unchangedText = (path: string): string => `${path} is unchanged since you read these lines earlier in this conversation; that result is above.`;

const readFailureSchema = z.object({ path: z.string(), error: z.object({ code: z.string(), message: z.string() }) });
const notReadSchema = z.object({ path: z.string(), notRead: z.literal(true) });
const unchangedSchema = z.object({ path: z.string(), unchanged: z.literal(true) });

/** One file of `fs read-files` (ADR 0097, 1): its read, why it couldn't be read, that the budget was used, or that the chat holds it. */
export const filesEntrySchema = z.union([fileReadSchema, readFailureSchema, notReadSchema, unchangedSchema]);

export type FilesEntry = z.output<typeof filesEntrySchema>;

/** One file of `fs read-files` as the model reads it. */
export function filesEntryText(entry: FilesEntry): string {
  if ('error' in entry) return `${entry.path} · error ${entry.error.code}: ${entry.error.message}`;
  if ('notRead' in entry) return `${entry.path} · not read: the files before it used this call's 30 KB; read it in another call`;
  if ('unchanged' in entry) return unchangedText(entry.path);
  return readText(entry);
}

export const editValueSchema = z.object({ path: z.string(), replacements: z.number().int(), fromLine: z.number().int(), content: z.string(), skipped: z.object({ afterLine: z.number().int(), lines: z.number().int() }).exactOptional() });

/** An edit's result as the model reads it: the changed lines numbered, a long change's marker unnumbered. */
export function editText(edit: z.output<typeof editValueSchema>): string {
  const marker = edit.skipped === undefined ? -1 : edit.skipped.afterLine - edit.fromLine + 1;
  const shown: string[] = [];
  let number = edit.fromLine;
  for (const [index, line] of linesOf(edit.content).entries()) {
    if (index === marker) {
      shown.push(line.replace(/\r?\n$/, ''));
      number += edit.skipped?.lines ?? 0;
      continue;
    }
    shown.push(numberedLine(number, line));
    number += 1;
  }
  const last = number - 1;
  const range = last <= edit.fromLine ? `line ${String(edit.fromLine)} now reads` : `lines ${String(edit.fromLine)}–${String(last)} now read`;
  const replacements = `${String(edit.replacements)} ${edit.replacements === 1 ? 'replacement' : 'replacements'}`;
  return `${edit.path} · ${replacements} · ${range}:\n${shown.join('\n')}`;
}
