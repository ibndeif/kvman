import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { useKvcoder } from './support/kvcoder-kernel.ts';
import { calls, says, toolResults } from './support/model-script.ts';
import { newSession } from './support/turns.ts';

const kvcoder = useKvcoder();

async function run(command: string) {
  const world = await kvcoder.start();
  const sessionId = await newSession(world.kernel);
  world.fake.reply(calls(command), says('ok'));
  await world.kernel.exec('kvcoder.message.send', { sessionId, text: 'go' });
  await world.kernel.clock.advance(0);
  return { ...world, result: toolResults(world.fake)[0] ?? '' };
}

describe('fs write with its content as the heredoc body (08 §8.5, ADR 0009, 187)', { timeout: 30_000 }, () => {
  it('QA8-H1 the file holds the body exactly, with a final line break, and its folders are created', async () => {
    const body = '<p class="a">"quoted" \\n and a backslash \\</p>\n  <script>const x = `$HOME ${1}`;</script>';
    const { kernel, result } = await run(`fs write '{"path":"a/b/index.html"}' <<'EOF'\n${body}\nEOF`);
    expect(readFileSync(path.join(kernel.homeFolder, 'a/b/index.html'), 'utf8')).toBe(`${body}\n`);
    expect(result).toMatch(/^\{\n {2}"path": "a\/b\/index.html",\n {2}"created": true,\n {2}"bytes": \d+\n\}\n\[exit code 0\]$/);
    expect(result).toContain(`"bytes": ${String(Buffer.byteLength(`${body}\n`))}`);
  });

  it('QA8-E4 an empty body makes an empty file', async () => {
    const { kernel, result } = await run(`fs write '{"path":"empty.txt"}' <<'EOF'\n\nEOF`);
    expect(existsSync(path.join(kernel.homeFolder, 'empty.txt'))).toBe(true);
    expect(readFileSync(path.join(kernel.homeFolder, 'empty.txt'), 'utf8')).toBe('');
    expect(result).toContain('"created": true');
  });

  it('QA8-E5 a body that looks like JSON is just text', async () => {
    const { kernel } = await run(`fs write '{"path":"data.json"}' <<'EOF'\n{"a": 1, "b": [true]}\nEOF`);
    expect(readFileSync(path.join(kernel.homeFolder, 'data.json'), 'utf8')).toBe('{"a": 1, "b": [true]}\n');
  });
});
