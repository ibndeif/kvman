import { describe, expect, it } from 'vitest';
import { z } from '@kvman/sdk';
import { useKvcoder } from './support/kvcoder-kernel.ts';
import { command, requestTools, runs, says, shell, toolResults } from './support/model-script.ts';
import { newSession } from './support/turns.ts';

const kvcoder = useKvcoder();

const enumSchema = z.object({ function: z.object({ parameters: z.object({ properties: z.object({ connector: z.object({ enum: z.array(z.string()) }) }) }) }) });

describe("a subagent's connectors (08 §8.5, ADR 0011, 9)", { timeout: 30_000 }, () => {
  it('QA18-H16 a child is given only the connectors named, with ask, and the shell is one of them or not', async () => {
    const { kernel, fake } = await kvcoder.start();
    const sessionId = await newSession(kernel);
    fake.reply(runs(command('subagent', 'run', { task: 'Review', mode: 'fresh', connectors: ['fs'] })), runs(shell('echo hi'), command('fs', 'list')), says('child done'), says('parent done'));
    await kernel.exec('kvcoder.message.send', { sessionId, text: 'go' });
    await kernel.clock.advance(0);
    expect(enumSchema.parse(requestTools(fake, 1)[0]).function.parameters.properties.connector.enum).toEqual(['fs', 'ask']);
    const child = toolResults(fake, 2);
    expect(child[0]).toBe("error VALIDATION_FAILED: shell isn't available in this subagent.");
    expect(child[1]).toContain('"entries"');
    expect(toolResults(fake, 3)).toEqual(['child done']);
  });

  it('QA18-E24 a child cannot be given subagent or an unknown connector, and the payload has no shell field', async () => {
    const { kernel, fake } = await kvcoder.start();
    const sessionId = await newSession(kernel);
    const run = (extra: Record<string, unknown>) => command('subagent', 'run', { task: 'x', mode: 'fresh', ...extra });
    fake.reply(runs(run({ connectors: ['subagent'] }), run({ connectors: ['nope'] }), run({ shell: false })), says('ok'));
    await kernel.exec('kvcoder.message.send', { sessionId, text: 'go' });
    await kernel.clock.advance(0);
    const results = toolResults(fake);
    expect(results[0]).toBe("error VALIDATION_FAILED: A subagent can't have the connector subagent.");
    expect(results[1]).toBe("error VALIDATION_FAILED: A subagent can't have the connector nope.");
    expect(results[2]).toMatch(/^error VALIDATION_FAILED: payload: Unrecognized key: "shell"\. The payload of subagent run is\n\{ task, mode: "fresh" \| "fork", connectors\?, background\? \}$/);
    expect(await kernel.exec('kvcoder.session.list', { limit: 10 })).toHaveLength(1);
  });
});
