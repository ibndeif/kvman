import { z } from '@kvman/sdk';
import { artifactFormats } from '../artifacts/artifact-format.ts';
import { kebab } from './registry.ts';

// The payloads of the built-in connectors' commands (plan 08 §8.3 and §8.5): strict, with a description on every field,
// since `help` shows these schemas to the model (ADR 0011, 10).

const risky = z
  .boolean()
  .describe("true when this could lose or damage something that isn't your own work, or reaches outside the workspace folder: deleting or overwriting files you didn't create, sudo, a global install, git push --force or reset --hard. The person is asked first. Otherwise false. Left out, it counts as true.")
  .exactOptional();

const background = z.boolean().describe('true keeps a server or any long-running command running after the call returns; follow it up with the background connector.').exactOptional();

const timeoutMs = z.number().int().positive().describe('How long the command may run, in milliseconds: 120000 by default, at most 600000. Ignored with background.').exactOptional();

const filePath = (what: string) => z.string().min(1).describe(`${what}, relative to the workspace folder, or absolute inside it.`);

const edits = z
  .array(z.strictObject({ oldText: z.string().describe('The exact text to replace, as it is now, whitespace and line breaks included. It must occur once.'), newText: z.string().describe('The text that replaces it.') }))
  .min(1)
  .describe('The replacements, applied together. They must not overlap; put several changes to one target in one call.');

const idMessage = 'An artifact id is lowercase kebab case, such as plan or login-design, up to 50 characters.';

const artifactId = z.string().max(50, idMessage).regex(kebab, idMessage).describe('The name of the artifact within this chat, in lowercase kebab case, up to 50 characters, such as plan.');

const prompt = z.string().min(1).describe('The question, as the person reads it.');

export const payloads = {
  shellExec: z.strictObject({ line: z.string().min(1).describe('The whole shell line to run, with any pipes, &&, or redirection.'), background, timeoutMs, risky }),
  binaryExec: z.strictObject({ args: z.string().describe("The program's arguments, as you would type them after its name.").exactOptional(), background, timeoutMs, risky }),
  fsRead: z.strictObject({
    path: filePath('The file to read'),
    fromLine: z.number().int().min(1).describe('The first line to return, counting from 1. The default is 1.').exactOptional(),
    lines: z.number().int().min(1).max(2000).describe('How many lines to return: 2000 by default, which is also the most.').exactOptional(),
  }),
  fsList: z.strictObject({ path: filePath('The folder to list').exactOptional() }),
  fsSearch: z.strictObject({
    pattern: z.string().min(1).describe('A JavaScript regular expression, matched against each line, case-sensitive.'),
    path: filePath('The file or folder to search; the workspace folder when left out').exactOptional(),
  }),
  fsWrite: z.strictObject({ path: filePath('The file to create or replace'), content: z.string().describe('The whole content of the file.'), risky }),
  fsEdit: z.strictObject({ path: filePath('The existing text file to change'), edits, risky }),
  artifactWrite: z.strictObject({
    id: artifactId,
    title: z.string().min(1).max(100).describe('The title the person sees, up to 100 characters.'),
    format: z.enum(artifactFormats).describe('markdown, html, or url. Left out, a page that starts with <!doctype html or <html is html, a lone localhost address is url, and anything else markdown.').exactOptional(),
    content: z.string().min(1).describe('The whole content, up to 64 KB.'),
  }),
  artifactEdit: z.strictObject({ id: artifactId, edits }),
  artifactGet: z.strictObject({ id: artifactId }),
  backgroundList: z.strictObject({}),
  backgroundOutput: z.strictObject({ id: z.string().min(1).describe('The id that the call which started the work returned.') }),
  backgroundStop: z.strictObject({ id: z.string().min(1).describe('The id that the call which started the work returned.') }),
  askText: z.strictObject({ prompt, placeholder: z.string().describe('A hint shown in the empty answer box.').exactOptional() }),
  askChoice: z.strictObject({
    prompt,
    multiple: z.boolean().describe('true when the person may choose several options.'),
    options: z
      .array(z.strictObject({ id: z.string().min(1).describe('What the answer names the option by.'), label: z.string().min(1).describe('The option, as the person reads it.'), description: z.string().describe('A line that explains the option.').exactOptional() }))
      .min(2)
      .max(10)
      .refine((options) => new Set(options.map((option) => option.id)).size === options.length, 'Option ids must differ.')
      .describe('Two to ten options, the recommended one first.'),
    other: z.boolean().describe('true lets the person write an answer of their own.').exactOptional(),
  }),
  askConfirm: z.strictObject({ prompt, danger: z.boolean().describe('true marks the confirmation as destructive.').exactOptional() }),
  subagentRun: z.strictObject({
    task: z.string().min(1).describe("The helper's whole brief: its role, the goal, the facts it needs, its limits, and what to return."),
    mode: z.enum(['fresh', 'fork']).describe('fresh starts from the task alone; fork starts from a copy of this conversation.'),
    connectors: z.array(z.string()).describe('The connectors the helper may use; all of yours when left out. It always has ask and never subagent.').exactOptional(),
    background: z.boolean().describe('true lets you go on at once; the answer arrives later as a message.').exactOptional(),
  }),
};

const sessionId = z.string().describe('The chat the call belongs to.');

/** A built-in command's job input: the chat it runs for, and the payload. */
export function callInput<Payload extends z.ZodType>(payload: Payload) {
  return z.strictObject({ sessionId, payload: payload.describe("The command's payload.") });
}

/** The same for a command that runs in the real shell: with the call's description, which names a background run. */
export function shellCallInput<Payload extends z.ZodType>(payload: Payload) {
  return z.strictObject({ sessionId, description: z.string().describe("The call's description, for the person."), payload: payload.describe("The command's payload.") });
}
