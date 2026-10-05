import { z, type Json } from '@kvman/sdk';
import type { BuiltinConnector } from '../connector-call.ts';
import { payloads } from '../schemas/payloads.ts';

// The built-in connectors' commands (plan 08 §8.3, ADR 0011, 10): each is one of kvcoder's private commands or queries,
// run with `ctx.exec`. `asks` marks the ones the person approves first; `result` says what a command returns when that
// isn't its JSON output, `notes` what its help adds to the payload's own descriptions, and `bounded` a command that
// limits its own result, which is then never cut (ADR 0011, 23).

export type BuiltinCommand = { registration: string; description: string; payload: z.ZodType; asks: boolean; result?: string; notes?: string; bounded?: true };

const artifactNotes =
  'The content is up to 64 KB, and a chat holds up to 20 artifacts. An "html" artifact is one self-contained page: its scripts run, but it can load nothing from the network (no external scripts, styles, images, or fonts: use inline CSS and JS, data: images, or inline SVG) and can\'t reach the rest of the app. A "url" artifact shows an app running on this machine, such as a dev server you started: its content is one http or https address on localhost or 127.0.0.1, shown in a scripts-only frame.';

const execResult = 'the combined output, then [exit code N].';
const dismissed = ', or { "dismissed": true }.';

export const builtinCommands = {
  shell: {
    exec: { registration: 'kvcoder.shell.run', description: 'Runs one line in the real shell, in the workspace folder.', payload: payloads.shellExec, asks: true, result: execResult },
  },
  fs: {
    read: { registration: 'kvcoder.fs.file.get', description: 'Reads lines of a text file.', payload: payloads.fsRead, asks: false, bounded: true },
    list: { registration: 'kvcoder.fs.entry.list', description: 'Lists the files and folders of one folder.', payload: payloads.fsList, asks: false, bounded: true },
    search: { registration: 'kvcoder.fs.text.search', description: 'Finds the lines that match a regular expression, in a file or under a folder.', payload: payloads.fsSearch, asks: false, bounded: true },
    write: { registration: 'kvcoder.fs.write', description: 'Creates a file and its parent folders, or replaces the file.', payload: payloads.fsWrite, asks: true },
    edit: { registration: 'kvcoder.fs.edit', description: 'Replaces exact pieces of text in an existing file; if one replacement fails, nothing is written.', payload: payloads.fsEdit, asks: true },
  },
  artifact: {
    write: { registration: 'kvcoder.artifact.write', description: 'Creates an artifact, or replaces its title, format, and content.', payload: payloads.artifactWrite, asks: false, notes: artifactNotes },
    edit: { registration: 'kvcoder.artifact.edit', description: 'Replaces exact pieces of text in an existing artifact; if one replacement fails, nothing changes.', payload: payloads.artifactEdit, asks: false },
    get: { registration: 'kvcoder.artifact.content.get', description: 'Reads an artifact with its content.', payload: payloads.artifactGet, asks: false },
  },
  background: {
    list: { registration: 'kvcoder.background.list', description: "Lists this chat's newest 50 background runs, newest first.", payload: payloads.backgroundList, asks: false },
    output: { registration: 'kvcoder.background.output.get', description: "Gives one background run's status, and its output (a process's last 100 lines, or a subagent's answer).", payload: payloads.backgroundOutput, asks: false },
    stop: { registration: 'kvcoder.background.stop', description: 'Stops a background process, or cancels a background subagent.', payload: payloads.backgroundStop, asks: false },
  },
  ask: {
    text: { registration: 'kvcoder.ask.text.check', description: 'Asks the person for a free answer and waits for it.', payload: payloads.askText, asks: false, result: `the person's answer: { "text" }${dismissed}` },
    choice: { registration: 'kvcoder.ask.choice.check', description: 'Asks the person to choose among options and waits for the answer.', payload: payloads.askChoice, asks: false, result: `the person's answer: { "selected": [ids], "other"? }${dismissed}` },
    confirm: { registration: 'kvcoder.ask.confirm.check', description: 'Asks the person yes or no and waits for the answer.', payload: payloads.askConfirm, asks: false, result: `the person's answer: { "confirmed" }${dismissed}` },
  },
  subagent: {
    run: { registration: 'kvcoder.subagent.check', description: 'Runs a helper agent on a task; several runs in one reply run in parallel.', payload: payloads.subagentRun, asks: false, result: "the helper's final answer, or started <id> with background." },
  },
} satisfies Record<BuiltinConnector, Record<string, BuiltinCommand>>;

/** A built-in connector's commands by name, in the order `help` lists them. */
export function commandsOf(connector: BuiltinConnector): Readonly<Record<string, BuiltinCommand>> {
  return builtinCommands[connector];
}

/** The one command of every binary connector besides `help` (plan 08 §8.4). */
export const binaryExec: BuiltinCommand = { registration: 'kvcoder.binary.run', description: 'Runs the program with the given arguments in the real shell, in the workspace folder.', payload: payloads.binaryExec, asks: true, result: execResult };

/** A payload schema as JSON Schema, the way the kernel shows an input (plan 02 §2.12). */
export function payloadJsonSchema(payload: z.ZodType): Json {
  return z.json().parse(z.toJSONSchema(payload, { io: 'input', unrepresentable: 'any' }));
}
