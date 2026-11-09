import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import type { Json } from '@kvman/sdk';
import type { TestKernel } from '@kvman/testkit';
import type { FakeOpenAI } from '@kvman/testkit/fake-openai';
import { useKvcoder } from './support/kvcoder-kernel.ts';
import { command, runs, says, systemPrompt, toolResults } from './support/model-script.ts';
import { newSession } from './support/turns.ts';
import { worker, workers } from './support/workers.ts';
import { delegated } from './support/helpers.ts';

const kvcoder = useKvcoder();
const docs = fileURLToPath(new URL('../../kvwebui/docs/', import.meta.url));
const page = (topic: string): string => readFileSync(`${docs}${topic}.md`, 'utf8');

// The connector names of a prompt's index, in order.
function indexed(prompt: string): (string | undefined)[] {
  const lines = (prompt.split('## Connectors\n')[1] ?? '').split('\n');
  return lines.filter((line) => line.startsWith('- ')).map((line) => /^- ([\w-]+): /.exec(line)?.[1]);
}

// One turn whose model calls `openui guide` with each payload, then says it's done; the calls' printed results.
async function guided(kernel: TestKernel, fake: FakeOpenAI, ...payloads: readonly Record<string, Json>[]): Promise<string[]> {
  const sessionId = await newSession(kernel);
  fake.reply(runs(...payloads.map((payload) => command('openui', 'guide', payload))), says('done'));
  await kernel.exec('kvcoder.message.send', { sessionId, text: 'go' });
  await kernel.clock.advance(0);
  return toolResults(fake);
}

const guideOf = (result: string | undefined): unknown => (JSON.parse(result ?? '{}') as { guide?: unknown }).guide;

describe('the openui connector (08 §8.5, ADR 0124, 5, 12, 13, 17)', { timeout: 30_000 }, () => {
  it('M5.18-H14 openui guide gives the index of a reply and of an artifact', async () => {
    const { kernel, fake } = await kvcoder.start();
    const results = await guided(kernel, fake, { place: 'reply' }, { place: 'artifact' });
    expect(guideOf(results[0])).toBe(page('openui-chat'));
    expect(guideOf(results[1])).toBe(page('openui'));
  });

  it('M5.18-H15 openui guide with groups gives those groups, joined in the order given', async () => {
    const { kernel, fake } = await kvcoder.start();
    const results = await guided(kernel, fake, { place: 'artifact', groups: ['Forms', 'Buttons'] }, { place: 'reply', groups: ['Lists & Follow-ups'] });
    expect(guideOf(results[0])).toBe(`${page('openui-forms')}\n${page('openui-buttons')}`);
    expect(guideOf(results[1])).toBe(page('openui-chat-lists-follow-ups'));
  });

  it('M5.19-H9 openui guide gives the tables and charts groups', async () => {
    const { kernel, fake } = await kvcoder.start();
    const results = await guided(kernel, fake, { place: 'artifact', groups: ['Tables', 'Charts (2D)'] });
    expect(guideOf(results[0])).toBe(`${page('openui-tables')}\n${page('openui-charts-2d')}`);
  });

  it("M5.18-H16 the lead's index lists openui with its one command line and none of the guide", async () => {
    const { kernel, fake } = await kvcoder.start();
    await guided(kernel, fake);
    const prompt = systemPrompt(fake, 0);
    expect(indexed(prompt)).toContain('openui');
    expect(prompt).toContain('- openui: Draw UI for the person: cards, choices, follow-up suggestions, forms, and buttons');
    expect(prompt).toContain('  guide { place: "reply" | "artifact", groups? }\n  help  { command? }');
    expect(prompt).not.toContain('## Syntax Rules');
    expect(prompt).not.toContain('# OpenUI in a reply');
  });

  it('M5.18-E17 an unknown group fails and names the groups of the place', async () => {
    const { kernel, fake } = await kvcoder.start();
    const results = await guided(kernel, fake, { place: 'reply', groups: ['Maps'] }, { place: 'artifact', groups: ['Forms', 'Nope'] });
    expect(results[0]).toBe('error VALIDATION_FAILED: There is no group Maps for a reply. The groups are: Buttons, Charts (1D), Charts (2D), Charts (Scatter), Content, Data Display, Forms, Layout, Lists & Follow-ups, Other, Sections, Tables.');
    expect(results[1]).toBe('error VALIDATION_FAILED: There is no group Nope for an artifact. The groups are: Buttons, Charts (1D), Charts (2D), Charts (Scatter), Content, Data Display, Forms, Layout, Tables.');
  });

  it('M5.18-E18 a payload with no place, an unknown place, no groups or 14 of them, or an unknown key fails', async () => {
    const { kernel, fake } = await kvcoder.start();
    const fourteen = Array.from({ length: 14 }, () => 'Forms');
    const results = await guided(kernel, fake, {}, { place: 'page' }, { place: 'reply', groups: [] }, { place: 'reply', groups: fourteen }, { place: 'reply', extra: true });
    expect(results).toHaveLength(5);
    for (const result of results) expect(result).toMatch(/^error VALIDATION_FAILED: /);
  });

  it('M5.18-E19 a helper never has openui, even when its worker lists it', async () => {
    const world = await kvcoder.start({ settings: workers(worker('limited', { connectors: ['fs', 'openui'] })) });
    const sessionId = await newSession(world.kernel);
    const run = command('delegate', 'run', { worker: 'limited', title: 'Helper', kind: 'find', goal: 'Review', done: 'It is done.' });
    await delegated(world, sessionId, [runs(run), says('Started.'), says('parent done')], [runs(command('openui', 'guide', { place: 'reply' })), says('child done')]);
    expect(indexed(systemPrompt(world.helperFake, 0))).toEqual(['fs']);
    expect(toolResults(world.helperFake, 1)).toEqual(["error VALIDATION_FAILED: openui isn't available in this subagent."]);
  });

  it('M5.18-E20 turned off, openui is in no index and a call to it finds no connector', async () => {
    const { kernel, fake } = await kvcoder.start({ settings: { 'kvcoder.connectors.disabled': ['openui'] } });
    const results = await guided(kernel, fake, { place: 'reply' });
    expect(indexed(systemPrompt(fake, 0))).not.toContain('openui');
    expect(results[0]).toMatch(/^error VALIDATION_FAILED: There is no connector openui\. The connectors are: (?!.*openui)/);
  });
});
