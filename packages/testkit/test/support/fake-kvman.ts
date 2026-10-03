import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

// A fake kvman entry for the preview bin's tests (09 §9.3): it records its arguments, writes its lock, listens on
// 127.0.0.1, and answers `kernel.health.get`, so the bin treats it as a ready preview. `FAKE_KVMAN_MODE` selects a
// failure: `exit-early` exits 1 at once, `silent` never answers health, `die-after-ready` exits 1 after its first
// health answer. The log holds the arguments as JSON, the working folder as JSON, then one line per signal.

const fakeEntry = `import { createServer } from 'node:http';
import { appendFileSync, mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const args = process.argv.slice(2);
const entryFolder = path.dirname(fileURLToPath(import.meta.url));
const logFile = process.env.FAKE_KVMAN_LOG ?? path.join(entryFolder, 'fake-kvman.log');
const log = (line) => appendFileSync(logFile, line + '\\n');
log(JSON.stringify(args));
log(JSON.stringify({ cwd: process.cwd() }));

const option = (name) => {
  const at = args.indexOf(name);
  return at === -1 ? undefined : args[at + 1];
};
const mode = process.env.FAKE_KVMAN_MODE ?? 'ready';
if (mode === 'exit-early') {
  process.stderr.write('fake kvman failing\\n');
  process.exit(1);
}
const home = option('--home');
const port = Number(option('--port'));
mkdirSync(home, { recursive: true });
writeFileSync(path.join(home, 'kvman.lock'), JSON.stringify({ pid: process.pid, port }));
const health = { version: '0.1.0', preset: 'preview', mode: 'web', workers: 1, uptimeMs: 1, languages: ['en'] };
const jobId = '0194f3f1-7b1a-7c1d-8c1d-000000000001';
let answered = 0;
const server = createServer((request, response) => {
  if (request.method === 'POST' && request.url === '/api/queries/kernel.health.get') {
    request.resume();
    if (mode === 'silent') return;
    answered += 1;
    response.writeHead(200, { 'content-type': 'application/json' });
    response.end(JSON.stringify({ ok: true, output: health, jobId }));
    if (mode === 'die-after-ready' && answered === 1) setTimeout(() => process.exit(1), 300);
    return;
  }
  request.resume();
  response.writeHead(404, { 'content-type': 'application/json' });
  response.end(JSON.stringify({ ok: false, problem: { code: 'NOT_FOUND', message: 'Not found.' } }));
});
server.listen(port, '127.0.0.1');
process.on('SIGINT', () => {
  log('SIGINT');
  process.exit(0);
});
process.on('SIGTERM', () => process.exit(0));
`;

/** Writes the fake kvman entry into `folder` and returns its path. */
export function writeFakeKvman(folder: string): string {
  mkdirSync(folder, { recursive: true });
  const entry = path.join(folder, 'fake-kvman.mjs');
  writeFileSync(entry, fakeEntry);
  return entry;
}

/** What the fake logged: the arguments it received, the folder it ran in, and the signals it saw. */
export type FakeLog = { args: string[]; cwd: string; signals: string[] };

/** Reads the fake's log file: its arguments line, its working-folder line, then its signal lines. */
export function readFakeLog(file: string): FakeLog {
  const lines = readFileSync(file, 'utf8').split('\n').filter((line) => line.length > 0);
  const args = JSON.parse(lines[0] ?? '[]') as string[];
  const start = JSON.parse(lines[1] ?? '{}') as { cwd?: string };
  if (typeof start.cwd !== 'string') throw new Error(`The fake kvman log ${file} has no working folder line.`);
  return { args, cwd: start.cwd, signals: lines.slice(2) };
}
