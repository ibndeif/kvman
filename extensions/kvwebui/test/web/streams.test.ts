import { ProblemError, type Json } from '@kvman/sdk';
import type { StreamEvent } from '@kvman/sdk/web';
import { describe, expect, it } from 'vitest';
import { defineComponent, h, ref, shallowRef } from 'vue';
import { fail, type FakeApi } from './support/fake-api.ts';
import { custom, customApi, notesTable, stack, useKvman } from './support/custom-page.ts';
import { createFakeComponents } from './support/fake-components.ts';
import { button, click, mountApp } from './support/mount-app.ts';

const problem = { code: 'notes/BROKE', message: 'It broke.' };
const unknownJob = '01900000-0000-7000-8000-999999999999';

// Reads `kvman.stream(jobId)` when its button is clicked, showing each event, and "done" when the loop ends; with
// `stopAfter`, it breaks out after that many events.
const reader = defineComponent({
  props: { jobId: { type: String, required: true }, stopAfter: { type: Number, default: 0 } },
  setup: (props) => {
    const kvman = useKvman();
    const events = shallowRef<StreamEvent[]>([]);
    const done = ref(false);
    const read = async (): Promise<void> => {
      for await (const event of kvman.stream(props.jobId)) {
        events.value = [...events.value, event];
        if (events.value.length === props.stopAfter) break;
      }
      done.value = true;
    };
    return () => h('div', { 'data-test': `reader-${props.jobId}` }, [h('button', { onClick: read }, `read ${props.jobId}`), h('output', JSON.stringify(events.value)), done.value ? h('b', 'done') : null]);
  },
});

// Follows a job (twice, with `twice`) when its button is clicked, and shows "followed" once `follow` resolves.
const follower = defineComponent({
  props: { jobId: { type: String, required: true }, twice: Boolean },
  setup: (props) => {
    const kvman = useKvman();
    const seen = ref('');
    const go = async (): Promise<void> => {
      await Promise.all(props.twice ? [kvman.follow(props.jobId), kvman.follow(props.jobId)] : [kvman.follow(props.jobId)]);
      seen.value = 'followed';
    };
    return () => h('div', [h('button', { onClick: go }, 'follow'), h('output', { 'data-test': 'followed' }, seen.value)]);
  },
});

// Starts a command with `execAsync`, shows its job id or refusal, and, with `read`, streams it too.
const starter = defineComponent({
  props: { command: { type: String, required: true }, read: Boolean },
  setup: (props) => {
    const kvman = useKvman();
    const shown = ref('');
    const start = async (): Promise<void> => {
      const jobId = await kvman.execAsync(props.command, {}).catch((error: unknown) => `refused ${error instanceof ProblemError ? error.problem.code : String(error)}`);
      shown.value = jobId;
      if (props.read && !jobId.startsWith('refused')) for await (const event of kvman.stream(jobId)) shown.value += ` ${event.type}`;
    };
    return () => h('div', [h('button', { onClick: start }, `start ${props.command}`), h('output', { 'data-test': `started-${props.command}` }, shown.value)]);
  },
});

function world(view: Json) {
  const api = customApi(view);
  const components = createFakeComponents();
  components.define('notes.reader', reader);
  components.define('notes.follower', follower);
  components.define('notes.starter', starter);
  return { api, components };
}

const shown = (element: HTMLElement | null) => element?.querySelector('output')?.textContent;

// Makes `name`'s fake handler also note what `look()` shows each time it runs.
function noting(api: FakeApi, name: string, look: () => string): string[] {
  const seen: string[] = [];
  const handler = api.handlers.get(name);
  api.handlers.set(name, (input, workspaceId, job) => {
    seen.push(look());
    return handler === undefined ? null : handler(input, workspaceId, job);
  });
  return seen;
}

const page = (view: Json) => ({ pages: [{ id: 'custom', title: 'notes.pages.list', view }], nav: [], panels: [], status: [{ id: 'count', query: 'notes.count.get', input: {}, text: 'notes.status.count', params: { count: { $output: 'count' } }, order: 1 }] });

describe('streams, follow, and execAsync (06 §6.4–§6.5, ADR 0009, 83)', () => {
  it("M2.3-H4 follow reruns the page's queries when the job ends", async () => {
    const { api, components } = world(notesTable);
    const job = api.jobs.create();
    api.handlers.set('notes.ui.get', () => page(stack(notesTable, custom('notes.follower', { jobId: job.id }))));
    const app = await mountApp(api, '/notes/custom', components);
    const followed = () => app.find('[data-test="followed"]')?.textContent ?? '';
    const lists = noting(api, 'notes.note.list', followed);
    const takes = noting(api, 'kvwebui.effect.take', followed);
    await click(button(app, 'follow'));
    expect(job.connections).toBe(1);
    job.progress('@test/notes', { step: 1 });
    await app.settle();
    expect(lists).toEqual([]);
    job.end({ ok: 1 });
    await app.settle();
    expect(followed()).toBe('followed');
    expect(lists).toEqual(['']);
    expect(takes).toEqual(['']);
    expect(api.callsTo('kvwebui.effect.take').map((call) => call.input)).toEqual([{ jobId: job.id }]);
  });

  it('M2.3-E7 a job started with execAsync is followed', async () => {
    const { api, components } = world(notesTable);
    api.handlers.set('notes.ui.get', () => page(stack(notesTable, custom('notes.starter', { command: 'notes.reindex' }), custom('notes.starter', { command: 'notes.vault' }))));
    api.handlers.set('notes.reindex', (_input, _workspace, job) => {
      job.addEffect({ type: 'toast', text: 'notes.first', level: 'success' });
      return null;
    });
    api.handlers.set('notes.vault', () => fail('VALIDATION_FAILED'));
    const app = await mountApp(api, '/notes/custom', components);
    const runs = (name: string) => api.callsTo(name).length;
    const [lists, counts] = [runs('notes.note.list'), runs('notes.count.get')];
    await click(button(app, 'start notes.reindex'));
    const call = api.callsTo('notes.reindex')[0];
    expect(call?.async).toBe(true);
    expect(app.find('[data-test="started-notes.reindex"]')?.textContent).toBe(call?.jobId);
    expect([runs('notes.note.list'), runs('notes.count.get'), app.state.toasts.list.length]).toEqual([lists, counts, 0]);
    api.jobs.get(call?.jobId ?? '')?.end(null);
    await app.settle();
    expect([runs('notes.note.list'), runs('notes.count.get')]).toEqual([lists + 1, counts + 1]);
    expect(app.state.toasts.list.map((toast) => toast.text)).toEqual(['notes.first']);
    await click(button(app, 'start notes.vault'));
    expect(app.find('[data-test="started-notes.vault"]')?.textContent).toBe('refused VALIDATION_FAILED');
  });

  it("M2.3-E8 stream gives the job's events, ends after the last one, and closes when it's no longer read", async () => {
    const { api, components } = world(notesTable);
    const [full, stopped, left] = [api.jobs.create(), api.jobs.create(), api.jobs.create()];
    const readers = [custom('notes.reader', { jobId: full.id }), custom('notes.reader', { jobId: unknownJob }), custom('notes.reader', { jobId: stopped.id, stopAfter: 1 }), custom('notes.reader', { jobId: left.id })];
    api.handlers.set('notes.ui.get', () => page(stack(...readers, custom('notes.starter', { command: 'notes.reindex', read: true }))));
    api.handlers.set('notes.reindex', () => null);
    const app = await mountApp(api, '/notes/custom', components);
    const readerOf = (jobId: string) => app.find(`[data-test="reader-${jobId}"]`);
    for (const jobId of [full.id, unknownJob, stopped.id, left.id]) await click(button(app, `read ${jobId}`));

    full.progress('@test/notes', { n: 1 });
    full.progress('@test/other', { n: 2 });
    full.fail(problem);
    await app.settle();
    expect(JSON.parse(shown(readerOf(full.id)) ?? '')).toEqual([
      { type: 'progress', source: '@test/notes', data: { n: 1 } },
      { type: 'progress', source: '@test/other', data: { n: 2 } },
      { type: 'problem', problem },
    ]);
    expect(readerOf(full.id)?.textContent).toContain('done');
    expect(JSON.parse(shown(readerOf(unknownJob)) ?? '')).toMatchObject([{ type: 'problem', problem: { code: 'NOT_FOUND' } }]);

    stopped.progress('@test/notes', { n: 1 });
    await app.settle();
    expect(readerOf(stopped.id)?.textContent).toContain('done');
    expect(stopped.aborts).toBe(1);

    await click(button(app, 'start notes.reindex'));
    const started = api.jobs.get(api.callsTo('notes.reindex')[0]?.jobId ?? '');
    started?.end(null);
    await app.settle();
    expect(started?.connections).toBe(1);
    expect(app.find('[data-test="started-notes.reindex"]')?.textContent).toBe(`${started?.id ?? ''} result`);

    expect(left.aborts).toBe(0);
    await app.router.push('/notes/note/1');
    await app.settle();
    expect(left.aborts).toBe(1);
  });

  it('M2.3-E9 a followed job that fails still applies its effects, and a job is followed once', async () => {
    const { api, components } = world(notesTable);
    const job = api.jobs.create();
    job.addEffect({ type: 'toast', text: 'notes.after', level: 'info' });
    api.handlers.set('notes.ui.get', () => page(custom('notes.follower', { jobId: job.id, twice: true })));
    const app = await mountApp(api, '/notes/custom', components);
    await click(button(app, 'follow'));
    job.fail(problem);
    await app.settle();
    expect(app.find('[data-test="followed"]')?.textContent).toBe('followed');
    expect(api.callsTo('kvwebui.effect.take')).toHaveLength(1);
    expect(app.state.toasts.list.map((toast) => `${toast.level}:${toast.text}`)).toEqual(['info:notes.after']);
  });
});
