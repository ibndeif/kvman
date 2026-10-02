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
  return { ...world, sessionId, result: toolResults(world.fake)[0] ?? '' };
}

describe('artifact write with its content as the heredoc body (08 §8.5, ADR 0009, 187)', { timeout: 30_000 }, () => {
  it('QA8-H2 the artifact holds the page exactly, with its title and format', async () => {
    const page = '<!doctype html>\n<h1 class="t">Design</h1>\n<script>document.title = "a \\"b\\"";</script>';
    const { kernel, sessionId, result } = await run(`artifact write '{"id":"design","title":"Design","format":"html"}' <<'EOF'\n${page}\nEOF`);
    expect(result).toMatch(/"id": "design",\n {2}"version": 1,\n {2}"created": true/);
    expect(await kernel.exec('kvcoder.artifact.get', { sessionId, id: 'design' })).toMatchObject({ title: 'Design', format: 'html', content: `${page}\n`, version: 1 });
  });

  it('QA8-E4 an empty body is an empty content: for an artifact that is never valid', async () => {
    const { kernel, sessionId, result } = await run(`artifact write '{"id":"design","title":"Design"}' <<'EOF'\n\nEOF`);
    expect(result).toMatch(/^error VALIDATION_FAILED: /);
    expect(await kernel.exec('kvcoder.artifact.list', { sessionId })).toEqual([]);
  });
});
