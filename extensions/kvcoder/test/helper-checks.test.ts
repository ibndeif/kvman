import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { describe, expect, it } from 'vitest';
import type { TestKernel } from '@kvman/testkit';
import { useKvcoder } from './support/kvcoder-kernel.ts';
import { command, runs, says, toolResults } from './support/model-script.ts';
import { newSession } from './support/turns.ts';
import { programWorker, useWorkerPrograms } from './support/worker-programs.ts';
import { worker, workers } from './support/workers.ts';

// ADR 0087, 10: a helper starts with its parent's check results less the program workers', and never checks a program.

const kvcoder = useKvcoder();
const programs = useWorkerPrograms();

const helperOf = (result: string | undefined): string => /\(helper (\S+)\)$/.exec(result ?? '')?.[1] ?? '';

// A binary connector whose check leaves a line in `marker` each time it runs, and a program worker `cc`.
function settings(marker: string) {
  const probe = { name: 'probe', description: 'A probe.', binary: { check: `echo x >> '${marker}'` } };
  return { ...workers(worker('general'), programWorker('cc', 'claude')), 'kvcoder.connectors': [probe] };
}

const checkRuns = (marker: string): number => (existsSync(marker) ? readFileSync(marker, 'utf8').split('\n').filter((line) => line !== '').length : 0);

async function send(kernel: TestKernel, sessionId: string): Promise<void> {
  await kernel.exec('kvcoder.message.send', { sessionId, text: 'go' });
  await kernel.clock.advance(0);
}

describe("a helper's checks (ADR 0087, 10)", { timeout: 60_000 }, () => {
  it("QA55-H10 a helper starts with its parent's binary checks and runs none", async () => {
    const installed = programs.install('claude');
    const marker = path.join(installed.folder, 'probe-checks');
    const { kernel, fake } = await kvcoder.start({ settings: settings(marker) });
    const sessionId = await newSession(kernel);
    fake.reply(runs(command('delegate', 'run', { worker: 'general', title: 'Helper', task: 'Do it' })), says('helped'), says('done'));
    await send(kernel, sessionId);
    const id = helperOf(toolResults(fake).at(-1));
    expect((await kernel.exec('kvcoder.session.get', { sessionId })).checks).toEqual([{ name: 'probe', passed: true }, { name: 'worker:cc', passed: true }]);
    expect((await kernel.exec('kvcoder.session.get', { sessionId: id })).checks).toEqual([{ name: 'probe', passed: true }]);
    expect(checkRuns(marker)).toBe(1);
    expect(installed.versions('claude')).toBe(1);
  });

  it('QA55-E16 a helper stored with no checks runs the binary checks, and never a program worker check', async () => {
    const installed = programs.install('claude');
    const marker = path.join(installed.folder, 'probe-checks');
    const { kernel, fake } = await kvcoder.start({ settings: settings(marker) });
    const sessionId = await newSession(kernel);
    fake.reply(runs(command('delegate', 'run', { worker: 'general', title: 'Helper', task: 'Do it' })), says('helped'), says('done'));
    await send(kernel, sessionId);
    const id = helperOf(toolResults(fake).at(-1));
    // A helper stored before ADR 0087 has no check results.
    const database = new DatabaseSync(path.join(kernel.home, 'kvman.db'));
    try {
      database.prepare("UPDATE store_documents SET data = json_set(data, '$.checks', json('null')) WHERE extension = '@kvman/kvcoder' AND collection = 'sessions' AND id = ?").run(id);
    } finally {
      database.close();
    }
    fake.reply(runs(command('delegate', 'continue', { id, message: 'Again.' })), says('helped again'), says('done again'));
    await send(kernel, sessionId);
    expect(toolResults(fake).at(-1)).toBe(`helped again\n\n(helper ${id})`);
    expect((await kernel.exec('kvcoder.session.get', { sessionId: id })).checks).toEqual([{ name: 'probe', passed: true }]);
    expect(checkRuns(marker)).toBe(2);
    expect(installed.versions('claude')).toBe(1);
  });
});
