import { describe, expect, it } from 'vitest';
import { useKvcoder } from './support/kvcoder-kernel.ts';
import { command, runs, says, toolResults } from './support/model-script.ts';
import { newSession } from './support/turns.ts';

// A new request's map starts fresh, and a chat shows an address in one url artifact (plan 08 §8.5, ADR 0114, 1 and 3).

const kvcoder = useKvcoder();
const evidence = 'pnpm test passed, 12 of 12';
const steps = [{ id: 'chapter-1', title: 'Do chapter 1', check: 'check it', details: 'How' }, { id: 'chapter-2', title: 'Do chapter 2', check: 'check it', details: 'How' }];
const set = (goal: string) => command('execution-map', 'set', { goal, steps });
const doneBoth = command('execution-map', 'update', { steps: [{ id: 'chapter-1', status: 'doing' }, { id: 'chapter-1', status: 'done', evidence }, { id: 'chapter-2', status: 'doing' }] });
const note = command('execution-map', 'note', { text: 'The footer link is broken.' });
const write = (id: string, content: string) => command('artifact', 'write', { id, title: 'Reader', format: 'url', content });

async function chat(...replies: Parameters<Awaited<ReturnType<typeof kvcoder.start>>['fake']['reply']>) {
  const world = await kvcoder.start();
  const sessionId = await newSession(world.kernel);
  world.fake.reply(...replies);
  await world.kernel.exec('kvcoder.message.send', { sessionId, text: 'go' });
  await world.kernel.clock.advance(0);
  return { ...world, sessionId };
}

describe("a new request's map (ADR 0114, 1)", { timeout: 30_000 }, () => {
  it('QA75-H1 a set with a new goal starts every step todo, with no notes, though the ids are the same', async () => {
    const { kernel, sessionId } = await chat(runs(set('Translate the book')), runs(doneBoth), runs(note), runs(set('Revise the terminology')), says('planned'));
    const map = await kernel.exec('kvcoder.map.get', { sessionId });
    expect(map?.steps.map((step) => [step.id, step.status, step.evidence])).toEqual([['chapter-1', 'todo', null], ['chapter-2', 'todo', null]]);
    expect(map).toMatchObject({ goal: 'Revise the terminology', notes: [] });
  });

  it('QA75-E1 a set with the same goal keeps how far each step got, and the notes', async () => {
    const { kernel, sessionId } = await chat(runs(set('Translate the book')), runs(doneBoth), runs(note), runs(set('Translate the book')), says('planned'));
    const map = await kernel.exec('kvcoder.map.get', { sessionId });
    expect(map?.steps.map((step) => [step.id, step.status])).toEqual([['chapter-1', 'done'], ['chapter-2', 'doing']]);
    expect(map?.notes).toHaveLength(1);
  });
});

describe('one url artifact per address (ADR 0114, 3)', { timeout: 30_000 }, () => {
  it('QA75-H2 writing an address under another id removes the chat\'s other url artifacts with that address, and says which', async () => {
    const { kernel, fake, sessionId } = await chat(
      runs(write('management-app', 'http://127.0.0.1:8000/')),
      runs(command('artifact', 'write', { id: 'notes', title: 'Notes', content: 'http://127.0.0.1:8000/ is the reader' })),
      runs(write('reader', 'http://127.0.0.1:8000')),
      says('shown'),
    );
    expect(JSON.parse(toolResults(fake).at(-1) ?? 'null')).toMatchObject({ id: 'reader', created: true, removed: ['management-app'] });
    expect((await kernel.exec('kvcoder.artifact.list', { sessionId })).map((artifact) => artifact.id).sort()).toEqual(['notes', 'reader']);
  });

  it('QA75-E2 another address, and writing the same id again, remove nothing', async () => {
    const { kernel, fake, sessionId } = await chat(runs(write('app', 'http://127.0.0.1:8000/')), runs(write('docs', 'http://127.0.0.1:5173/')), runs(write('app', 'http://127.0.0.1:8000/')), says('shown'));
    expect(JSON.parse(toolResults(fake).at(-1) ?? 'null')).not.toHaveProperty('removed');
    expect((await kernel.exec('kvcoder.artifact.list', { sessionId })).map((artifact) => artifact.id).sort()).toEqual(['app', 'docs']);
  });
});
