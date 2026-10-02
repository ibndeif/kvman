import { ProblemError, z, type Json, type Problem } from '@kvman/sdk';

// How kvcoder reads a shell line (plan 08 §8.3, ADR 0009, 93, 96, and 100), shared by its turns and by
// `runConnector` in `@kvman/kvcoder/testing`. As an exported subpath, this file imports only the SDK.

/** A line as kvcoder sees it: the real shell, a connector word in shell syntax, or a standalone connector call. */
export type ParsedLine =
  | { kind: 'shell' }
  | { kind: 'refused'; connector: string }
  | { kind: 'call'; connector: string; words: string[]; stdin: string | null; async: boolean };

/** A JSON value as zod parses it. */
export type JsonValue = z.output<ReturnType<typeof z.json>>;

/** What a connector call printed, and its exit code. */
export type CallResult = { output: string; exitCode: number };

/** The connectors kvcoder runs itself. */
export const builtinConnectors = ['ask', 'subagent', 'jobs', 'fs', 'artifact'] as const;

const headMarkers = new Set(['|', '&', ';', '(']);
const operators = new Set(['|', '&', ';', '(', ')', '<', '>']);

type Scan = { words: string[]; heads: string[]; simple: boolean };

// Splits a one-line command into words the way both shells do for literal text; anything that needs the shell
// (operators, expansions, a second line, a comment) makes the line not simple.
function scan(text: string): Scan {
  const words: string[] = [];
  const heads: string[] = [];
  let word: string | null = null;
  let head = true;
  let simple = true;
  const end = (): void => {
    if (word === null) return;
    words.push(word);
    if (head) heads.push(word);
    head = false;
    word = null;
  };
  for (let index = 0; index < text.length; index += 1) {
    const char = text.charAt(index);
    if (char === "'") {
      const close = text.indexOf("'", index + 1);
      if (close < 0) return { words, heads, simple: false };
      word = (word ?? '') + text.slice(index + 1, close);
      index = close;
    } else if (char === '"') {
      let value = '';
      for (index += 1; index < text.length && text.charAt(index) !== '"'; index += 1) {
        const inner = text.charAt(index);
        if (inner === '$' || inner === '`') simple = false;
        if (inner === '\\' && '"\\$`'.includes(text.charAt(index + 1))) index += 1;
        value += text.charAt(index);
      }
      if (index >= text.length) return { words, heads, simple: false };
      word = (word ?? '') + value;
    } else if (char === '\\') {
      word = (word ?? '') + text.charAt(index + 1);
      index += 1;
    } else if (char === ' ' || char === '\t') {
      end();
    } else if (char === '\n' || char === '\r' || char === '`' || char === '$' || (char === '#' && word === null)) {
      end();
      simple = false;
      head = char !== '#';
      if (char === '$' && text.charAt(index + 1) !== '(') head = false;
    } else if (operators.has(char)) {
      end();
      simple = false;
      head = headMarkers.has(char);
    } else {
      word = (word ?? '') + char;
    }
  }
  end();
  return { words, heads, simple };
}

const hereStringPattern = /^@'\r?\n([\s\S]*?)\r?\n'@[ \t]*\|[ \t]*([^\n]*)$/;
const heredocPattern = /^(.*?)\s*<<(-?)\s*(['"]?)([A-Za-z_][\w-]*)\3\s*$/;

// The command part and stdin of a line that feeds JSON on stdin; undefined when the line has no such form.
function stdinForm(line: string): { command: string; stdin: string } | undefined {
  const hereString = hereStringPattern.exec(line);
  if (hereString !== null) return { command: hereString[2] ?? '', stdin: hereString[1] ?? '' };
  const [first = '', ...rest] = line.split(/\r?\n/);
  const heredoc = heredocPattern.exec(first);
  if (heredoc === null) return undefined;
  const delimiter = heredoc[4] ?? '';
  const close = rest.findIndex((bodyLine) => (heredoc[2] === '-' ? bodyLine.replace(/^\t+/, '') : bodyLine) === delimiter);
  if (close < 0 || rest.slice(close + 1).some((after) => after.trim() !== '')) return undefined;
  return { command: heredoc[1] ?? '', stdin: rest.slice(0, close).join('\n') };
}

/** Reads a line: `connectors` are the words kvcoder runs itself (commands connectors and the built-ins). */
export function parseLine(line: string, connectors: ReadonlySet<string>): ParsedLine {
  const trimmed = line.trim();
  const form = stdinForm(trimmed);
  const scanned = scan(form?.command ?? trimmed);
  const [first] = scanned.words;
  if (scanned.simple && first !== undefined && connectors.has(first)) {
    const words = scanned.words.slice(1);
    return { kind: 'call', connector: first, words: words.filter((word) => word !== '--async'), stdin: form?.stdin ?? null, async: words.includes('--async') };
  }
  const refused = scanned.heads.find((word) => connectors.has(word));
  return refused === undefined ? { kind: 'shell' } : { kind: 'refused', connector: refused };
}

/** A Problem as a connector call prints it. */
export function errorOutput(problem: Pick<Problem, 'code' | 'message'>): CallResult {
  return { output: `error ${problem.code}: ${problem.message}`, exitCode: 1 };
}

/** A connector call's JSON output, indented by 2 spaces. */
export function jsonOutput(value: unknown): CallResult {
  return { output: JSON.stringify(value ?? null, null, 2), exitCode: 0 };
}

function invalid(message: string): CallResult {
  return errorOutput({ code: 'VALIDATION_FAILED', message });
}

/** A connector call's command and its JSON input, or what it printed instead. */
export function callInput(words: readonly string[], stdin: string | null, connector: string): { command: string; input: Record<string, JsonValue> } | CallResult {
  const [command, json, ...extra] = words;
  if (command === undefined) return invalid(`Name a command; run \`${connector} -h\` to see them.`);
  if (extra.length > 0) return invalid(`Unexpected words after the JSON input: ${extra.join(' ')}.`);
  if (json !== undefined && stdin !== null) return invalid('Give the JSON input once: as an argument or on stdin.');
  const text = json ?? stdin;
  if (text === null || text.trim() === '') return { command, input: {} };
  try {
    const parsed = z.record(z.string(), z.json()).safeParse(JSON.parse(text));
    return parsed.success ? { command, input: parsed.data } : invalid('The input must be a JSON object.');
  } catch (error) {
    return invalid(`The input isn't JSON: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/** A commands connector as kvcoder stores it. */
export type CommandsConnector = {
  name: string;
  description: string;
  commands: readonly { name: string; command: string; examples: readonly { description: string; input: Json }[] }[];
};

/** A registered command, as `kernel.extensions.list` describes it. */
export type CommandInfo = { name: string; description: string; input: Json; output: Json };

/** What running a commands connector needs: a way to run a command, and the registered commands. */
export type CallDeps = { exec(name: string, input: Record<string, Json>): Promise<unknown>; commands(): Promise<readonly CommandInfo[]> };


const quoted = (json: string): string => `'${json.replaceAll("'", "'\\''")}'`;

function connectorHelp(connector: CommandsConnector, infos: readonly CommandInfo[]): string {
  const width = Math.max(...connector.commands.map((command) => command.name.length), 0);
  const lines = connector.commands.map((command) => `  ${command.name.padEnd(width)}  ${infos.find((info) => info.name === command.command)?.description ?? ''}`);
  return [`${connector.name}: ${connector.description}`, '', 'Commands:', ...lines, '', `Run \`${connector.name} <command> -h\` for a command's input, output, and examples.`].join('\n');
}

function commandHelp(connector: CommandsConnector, command: CommandsConnector['commands'][number], info: CommandInfo | undefined): string {
  const examples = command.examples.flatMap((example) => [`  # ${example.description}`, `  ${connector.name} ${command.name} ${quoted(JSON.stringify(example.input))}`]);
  return [
    `${connector.name} ${command.name}: ${info?.description ?? ''}`,
    '',
    'Input (JSON Schema):',
    JSON.stringify(info?.input ?? {}, null, 2),
    '',
    'Output (JSON Schema):',
    JSON.stringify(info?.output ?? {}, null, 2),
    ...(examples.length > 0 ? ['', 'Examples:', ...examples] : []),
  ].join('\n');
}

function problemOf(error: unknown): Problem {
  if (error instanceof ProblemError) return error.problem;
  throw error;
}

/** Runs a standalone commands-connector call: `-h`, or its command through `exec`, as a turn does. */
export async function runCommandsCall(deps: CallDeps, connector: CommandsConnector, words: readonly string[], stdin: string | null): Promise<CallResult> {
  if (words.length === 1 && words[0] === '-h') return { output: connectorHelp(connector, await deps.commands()), exitCode: 0 };
  const command = connector.commands.find((candidate) => candidate.name === words[0]);
  if (words.length === 2 && words[1] === '-h' && command !== undefined) {
    return { output: commandHelp(connector, command, (await deps.commands()).find((info) => info.name === command.command)), exitCode: 0 };
  }
  const call = callInput(words, stdin, connector.name);
  if ('output' in call) return call;
  if (command === undefined) return errorOutput({ code: 'NOT_FOUND', message: `${connector.name} has no command ${call.command}; run \`${connector.name} -h\`.` });
  try {
    return jsonOutput(await deps.exec(command.command, call.input));
  } catch (error) {
    return errorOutput(problemOf(error));
  }
}

/** The `-h` text of each built-in connector. */
export const builtinHelp: Readonly<Record<(typeof builtinConnectors)[number], string>> = {
  ask: [
    'ask: Ask the person and wait for the answer.',
    '',
    'Commands:',
    `  text     ${quoted('{ "prompt", "placeholder"? }')} → { "text" }`,
    `  choice   ${quoted('{ "prompt", "multiple", "options": [{ "id", "label", "description"? }] (2–10), "other"? }')} → { "selected": [ids], "other"? }`,
    `  confirm  ${quoted('{ "prompt", "danger"? }')} → { "confirmed" }`,
    '',
    'A dismissed question gives { "dismissed": true }.',
  ].join('\n'),
  subagent: [
    'subagent: Run a helper agent on a task and get its final answer.',
    '',
    'Commands:',
    `  run  ${quoted('{ "task", "mode": "fresh" | "fork", "connectors"?: [names], "shell"?: true }')}`,
    '',
    '"fresh" starts from the task alone; "fork" starts from a copy of this conversation. Several runs in one reply run in',
    'parallel. Add --async to go on at once; the answer arrives later as a message.',
  ].join('\n'),
  jobs: [
    'jobs: The background work this chat started with --async, or with bash mode "async" (a server or other long-running command).',
    '',
    'Commands:',
    '  list         the newest 50, newest first',
    "  get <id>     one job's status, and its output (a process's last 100 lines) or problem",
    '  cancel <id>  cancels one; a process is stopped',
  ].join('\n'),
  fs: [
    'fs: Create, replace, or edit a file inside the workspace folder.',
    '',
    'Commands:',
    `  write  ${quoted('{ "path", "content" }')} → { "path", "created", "bytes" }`,
    `  edit   ${quoted('{ "path", "edits": [{ "oldText", "newText" }] }')} → { "path", "replacements", "firstChangedLine" }`,
    '',
    '"write" creates the file and its folders, or replaces it. "edit" needs an existing text file: each oldText must match',
    'the file exactly once, as it was before the call (whitespace and line breaks included), and edits must not overlap. If',
    'one fails, nothing is written. Put several changes to one file in one call. Paths are relative to the workspace folder',
    'and may not leave it.',
    '',
    'Give a whole file as the raw body of a heredoc, with only the path in JSON, so it needs no escaping, one file per call:',
    `  fs write ${quoted('{ "path": "index.html" }')} <<'EOF'`,
    '  …the file, exactly as it should be…',
    '  EOF',
  ].join('\n'),
  artifact: [
    'artifact: Show the person a document beside the chat: a plan, a report, a design, or a page.',
    '',
    'Commands:',
    `  write  ${quoted('{ "id", "title", "format"?, "content" }')} → { "id", "version", "created", "bytes" }`,
    `  edit   ${quoted('{ "id", "edits": [{ "oldText", "newText" }] }')} → { "id", "version", "replacements", "firstChangedLine" }`,
    `  get    ${quoted('{ "id" }')} → { "id", "title", "format", "version", "content" }`,
    '',
    '"write" creates the artifact or replaces it. "edit" needs an existing artifact: each oldText must match the content exactly',
    'once, as it was before the call, and edits must not overlap; if one fails, nothing changes. The id is lowercase kebab case',
    '(up to 50 characters), such as plan; the title is up to 100 characters; the format is "markdown" (the default) or "html";',
    'the content is up to 64 KB, and a chat holds up to 20 artifacts. An "html" artifact is one self-contained page: its scripts',
    'run, but it can load nothing from the network (no external scripts, styles, images, or fonts: use inline CSS and JS, data:',
    'images, or inline SVG) and can\'t reach the rest of the app.',
    '',
    'Give the content as the raw body of a heredoc, with the rest in JSON, so it needs no escaping:',
    `  artifact write ${quoted('{ "id": "design", "title": "Design", "format": "html" }')} <<'EOF'`,
    '  …the page, exactly as it should be…',
    '  EOF',
  ].join('\n'),
};

const connectorListSchema = z.array(z.object({ name: z.string(), description: z.string(), kind: z.enum(['commands', 'binary']), commands: z.array(z.object({ name: z.string(), command: z.string(), examples: z.array(z.object({ description: z.string(), input: z.json() })) })).exactOptional() }));
const callInfoSchema = z.object({ name: z.string(), description: z.string(), input: z.json(), output: z.json() });
const extensionsSchema = z.array(z.object({ commands: z.array(callInfoSchema), queries: z.array(callInfoSchema) }));

/** The test kernel `runConnector` needs: `@kvman/testkit`'s, with kvcoder loaded. */
export type ConnectorKernel = { exec(name: string, input: Record<string, Json>, options?: { as?: string; workspaceId?: string }): Promise<unknown> };

/** Runs a line exactly as kvcoder parses it, for connector lines only (ADR 0009, 96). */
export async function runConnector(kernel: ConnectorKernel, line: string, options: { workspaceId?: string } = {}): Promise<CallResult> {
  const call = { as: '@kvman/kvcoder', ...options };
  const connectors = connectorListSchema.parse(await kernel.exec('kvcoder.connector.list', {}, call)).filter((connector) => connector.kind === 'commands');
  const parsed = parseLine(line, new Set([...builtinConnectors, ...connectors.map((connector) => connector.name)]));
  if (parsed.kind === 'shell') return { output: 'not a connector call', exitCode: 1 };
  if (parsed.kind === 'refused') return { output: refusedText(parsed.connector), exitCode: 1 };
  const builtin = builtinConnectors.find((name) => name === parsed.connector);
  if (builtin !== undefined) {
    return parsed.words.length === 1 && parsed.words[0] === '-h' ? { output: builtinHelp[builtin], exitCode: 0 } : { output: `${builtin} runs only inside a turn`, exitCode: 1 };
  }
  const connector = connectors.find((candidate) => candidate.name === parsed.connector);
  const deps: CallDeps = {
    exec: (name, input) => kernel.exec(name, input, call),
    commands: async () => extensionsSchema.parse(await kernel.exec('kernel.extensions.list', {}, call)).flatMap((extension) => [...extension.commands, ...extension.queries]),
  };
  return runCommandsCall(deps, { name: parsed.connector, description: connector?.description ?? '', commands: connector?.commands ?? [] }, parsed.words, parsed.stdin);
}

/** What a connector word inside shell syntax returns. */
export function refusedText(connector: string): string {
  return `${connector} is a connector, and connector calls stand alone: no pipes, &&, ;, redirections, or other shell syntax around them. Run it on its own line, then use its output.`;
}
