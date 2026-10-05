import { chmodSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach } from 'vitest';
import type { Json } from '@kvman/sdk';

// Fixture programs for program workers (plan 08 §8.5, ADR 0021): scripts named `opencode`, `pi`, and `claude` on the
// test's PATH, which is set before the kernel starts so its workers have it. A fixture records its arguments and folder,
// then does what the last line of its last argument says: `say:<text>`, `fail:<code>:<text>`, `silent`, or `wait:<file>`
// (print "released" once the file exists). `opencode` prints JSON events, as the real one does.

export type ProgramKind = 'opencode' | 'pi' | 'claude';

const script = `#!/usr/bin/env node
import { appendFileSync, existsSync, writeFileSync } from 'node:fs';
import path from 'node:path';
const name = path.basename(process.argv[1]);
const folder = path.dirname(process.argv[1]);
const args = process.argv.slice(2);
if (args[0] === '--version') { console.log('1.0.0'); process.exit(0); }
appendFileSync(path.join(folder, name + '.calls'), JSON.stringify({ args, cwd: process.cwd() }) + '\\n');
const say = (text) => console.log(name === 'opencode' ? JSON.stringify({ type: 'text', part: { text } }) : text);
const [verb, ...rest] = (args.at(-1) ?? '').split('\\n').at(-1).split(':');
if (verb === 'say') say(rest.join(':'));
if (verb === 'fail') {
  say('partial');
  if (name === 'opencode') console.log(JSON.stringify({ type: 'error', error: { message: rest.slice(1).join(':') } }));
  else console.error(rest.slice(1).join(':'));
  process.exit(Number(rest[0]));
}
if (verb === 'wait') {
  writeFileSync(path.join(folder, name + '.pid'), String(process.pid));
  const timer = setInterval(() => {
    if (!existsSync(rest.join(':'))) return;
    clearInterval(timer);
    say('released');
  }, 20);
}
`;

const callSchema = (line: string): { args: string[]; cwd: string } => JSON.parse(line) as { args: string[]; cwd: string };

export type Programs = {
  folder: string;
  /** A file a `wait:` task waits for. */
  gate: string;
  /** Lets every waiting fixture go on. */
  release(): void;
  calls(kind: ProgramKind): { args: string[]; cwd: string }[];
  pid(kind: ProgramKind): number | undefined;
  remove(kind: ProgramKind): void;
};

/** Installs the fixtures for the named kinds; call it before the kernel starts. */
export function useWorkerPrograms(): { install(...kinds: readonly ProgramKind[]): Programs } {
  const restore: (() => void)[] = [];
  afterEach(() => {
    for (const undo of restore.splice(0)) undo();
  });
  return {
    install: (...kinds) => {
      const folder = mkdtempSync(path.join(tmpdir(), 'kvcoder-programs-'));
      const before = process.env['PATH'];
      process.env['PATH'] = [folder, path.dirname(process.execPath), '/usr/bin', '/bin'].join(path.delimiter);
      restore.push(() => {
        process.env['PATH'] = before;
        rmSync(folder, { recursive: true, force: true });
      });
      for (const kind of kinds) {
        writeFileSync(path.join(folder, kind), script);
        chmodSync(path.join(folder, kind), 0o755);
      }
      const gate = path.join(folder, 'gate');
      const read = (file: string): string => (existsSync(path.join(folder, file)) ? readFileSync(path.join(folder, file), 'utf8') : '');
      return {
        folder,
        gate,
        release: () => writeFileSync(gate, ''),
        calls: (kind) => read(`${kind}.calls`).split('\n').filter((line) => line !== '').map(callSchema),
        pid: (kind) => (read(`${kind}.pid`) === '' ? undefined : Number(read(`${kind}.pid`))),
        remove: (kind) => rmSync(path.join(folder, kind)),
      };
    },
  };
}

const program = { enabled: true, instructions: '', approval: 'auto', timeoutMs: 600_000 };

/** A whole `opencode`, `pi`, or `claude` worker entry: turned on, starting at once, with every flag left out unless `fields` say otherwise. */
export function programWorker(name: string, kind: ProgramKind, fields: Record<string, Json> = {}): Record<string, Json> {
  const own: Record<ProgramKind, Record<string, Json>> = { opencode: { model: null, agent: null, autoApprove: true }, pi: { model: null, thinking: null, tools: null }, claude: { model: null, effort: null, permissionMode: 'acceptEdits' } };
  return { name, description: `The ${name} worker`, kind, ...program, ...own[kind], ...fields };
}
