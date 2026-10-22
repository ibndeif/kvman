// A stand-in for `kvman` in the extension's process tests (plan 12 §12.1). Its first argument chooses what it does; it
// records its arguments, its folder, and each line it reads in the file its second argument names.
import { appendFileSync, writeFileSync } from 'node:fs';
import { createInterface } from 'node:readline';

const [mode, record, ...args] = process.argv.slice(2);
const running = `${JSON.stringify({ kind: 'running', url: 'http://127.0.0.1:3737/?workspace=home', port: 3737 })}\n`;
writeFileSync(record, `${JSON.stringify({ args, folder: process.cwd() })}\n`);

if (mode === 'fails') {
  process.exit(3);
} else if (args.includes('--version')) {
  process.stdout.write('0.4.7\n');
} else if (mode === 'chunked') {
  const half = Math.floor(running.length / 2);
  process.stdout.write(running.slice(0, half), () => setTimeout(() => process.stdout.write(running.slice(half)), 50));
  createInterface({ input: process.stdin }).once('close', () => process.exit(0));
} else if (mode === 'trust') {
  process.stdout.write(`${JSON.stringify({ kind: 'trust', language: 'en', versions: [{ name: '@acme/hello', version: '1.0.0', source: 'npm:1.0.0' }] })}\n`);
  const lines = createInterface({ input: process.stdin });
  lines.on('line', (line) => {
    appendFileSync(record, `${line}\n`);
    if (line === '{"trust":true}') process.stdout.write(running);
  });
  lines.once('close', () => process.exit(0));
} else {
  process.stdout.write(running);
  const lines = createInterface({ input: process.stdin });
  lines.on('line', (line) => appendFileSync(record, `${line}\n`));
  lines.once('close', () => {
    appendFileSync(record, 'input closed\n');
    process.exit(0);
  });
}
