// A stand-in for `kvman --pipe` in the shell's process tests (plan 12 §12.1). Its first argument chooses what it does.
import { spawn } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { createInterface } from 'node:readline';

const [mode, file] = process.argv.slice(2);
const write = (line) => process.stdout.write(`${JSON.stringify(line)}\n`);
const running = { kind: 'running', url: 'http://127.0.0.1:3737/?workspace=home', port: 3737 };
const lines = createInterface({ input: process.stdin });

if (mode === 'trust') {
  write({ kind: 'trust', language: 'en', versions: [{ name: '@acme/hello', version: '1.0.0', source: 'npm:1.0.0' }] });
  lines.once('line', (line) => {
    if (line === '{"trust":true}') write(running);
  });
  lines.once('close', () => process.exit(0));
} else if (mode === 'exits-on-close') {
  write(running);
  lines.once('close', () => process.exit(0));
} else if (mode === 'ignores-close') {
  // The child shares this program's stdout, so the pipe closes only when the whole tree is gone.
  const child = spawn(process.execPath, ['-e', 'setInterval(() => undefined, 1000)'], { stdio: ['ignore', 'inherit', 'ignore'] });
  writeFileSync(file, JSON.stringify({ pid: process.pid, child: child.pid }));
  write(running);
  setInterval(() => undefined, 1000);
} else {
  process.exit(1);
}
