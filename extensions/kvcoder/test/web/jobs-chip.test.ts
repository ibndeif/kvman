import { flushPromises } from '@vue/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';
import ConversationHeader from '../../web/src/ConversationHeader.vue';
import { createFakeKvman } from './support/fake-kvman.ts';
import { job, mounted, serve, session } from './support/fixtures.ts';

// Only the clock the chip reads is faked: flushPromises needs the real scheduler.
const started = Date.parse('2026-10-01T09:00:00.000Z');

afterEach(() => vi.useRealTimers());

function setup(jobs: ReturnType<typeof job>[]) {
  vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'Date'], now: started + 72_000 });
  const fake = createFakeKvman();
  const world = { found: session(), messages: [], omitted: 0, turns: [], jobs };
  serve(fake, world);
  fake.handle('kvcoder.job.get', (input) => ({ ...(world.jobs.find((found) => found.id === input['id']) ?? job()), output: 'Serving HTTP on 0.0.0.0 port 8000' }));
  fake.handle('kvcoder.job.cancel', (input) => {
    world.jobs = world.jobs.map((found) => (found.id === input['id'] ? { ...found, status: 'cancelled', endedAt: '2026-10-01T09:01:13.000Z' } : found));
    return {};
  });
  return { fake, world, mount: () => mounted(ConversationHeader, fake, { session: world.found, tab: 'chat', turns: 1 }) };
}

describe("the Running chip in the conversation's header (08 §8.7, ADR 0009, 153)", () => {
  // Superseded by QA67-H15: once every job ended the chip stays as Background (N) (ADR 0102, 7).
  it('QA3-H18 QA67-H15 the chip counts running jobs, its list shows links, logs, and Stop, and once none runs it reads Background (N)', async () => {
    const { world, fake, mount } = setup([job({ links: ['http://localhost:8000'] })]);
    const wrapper = await mount();
    expect(wrapper.find('[data-test="jobs-words"]').text()).toBe('1 running');
    await wrapper.find('[data-test="jobs-chip"]').trigger('click');
    expect(wrapper.find('[data-test="job-title"]').text()).toBe('Start the dev server');
    expect(wrapper.find('[data-test="job-time"]').text()).toBe('1 min 12 s');
    const link = wrapper.find('[data-test="job-link"]');
    expect(link.attributes()).toMatchObject({ href: 'http://localhost:8000', target: '_blank' });

    await wrapper.find('[data-test="job-logs-j1"]').trigger('click');
    await flushPromises();
    expect(wrapper.find('[data-test="job-output"]').text()).toBe('Serving HTTP on 0.0.0.0 port 8000');

    await wrapper.find('[data-test="job-stop-j1"]').trigger('click');
    await flushPromises();
    expect(fake.calls).toContainEqual({ name: 'kvcoder.job.cancel', input: { sessionId: 's1', id: 'j1' } });
    expect(wrapper.find('[data-test="job-status"]').text()).toBe('Stopped');
    expect(wrapper.find('[data-test="job-stop-j1"]').exists()).toBe(false);
    expect(wrapper.find('[data-test="jobs-words"]').text()).toBe('Background (1)');

    await wrapper.find('[data-test="jobs-popover"]').trigger('keydown', { key: 'Escape' });
    expect(wrapper.find('[data-test="jobs-popover"]').exists()).toBe(false);
    expect(wrapper.find('[data-test="jobs-words"]').text()).toBe('Background (1)');
    expect(world.jobs[0]?.status).toBe('cancelled');
  });

  it('QA3-E21 the list is read again every 5 s while a job runs, and the chip turns quiet when it ended', async () => {
    const { world, fake, mount } = setup([job()]);
    const wrapper = await mount();
    const reads = () => fake.calls.filter((call) => call.name === 'kvcoder.job.list').length;
    expect(reads()).toBe(1);
    await vi.advanceTimersByTimeAsync(5_000);
    expect(reads()).toBe(2);
    world.jobs = [job({ status: 'failed', exitCode: 1 })];
    await vi.advanceTimersByTimeAsync(5_000);
    await flushPromises();
    expect(wrapper.find('[data-test="jobs-words"]').text()).toBe('Background (1)');
    await vi.advanceTimersByTimeAsync(10_000);
    expect(reads()).toBe(3);
  });

  it("QA32-H16 a program worker's run is a row: its worker and time, Stop while it runs, and its output under Logs", async () => {
    const { world, fake, mount } = setup([job({ id: 'r1', kind: 'worker', title: 'opencode', call: 'Writing the retry test.' })]);
    const wrapper = await mount();
    expect(wrapper.find('[data-test="jobs-words"]').text()).toBe('1 running');
    await wrapper.find('[data-test="jobs-chip"]').trigger('click');
    expect(wrapper.find('[data-test="job-title"]').text()).toBe('opencode');
    expect(wrapper.find('[data-test="job-time"]').text()).toBe('1 min 12 s');
    await wrapper.find('[data-test="job-stop-r1"]').trigger('click');
    await flushPromises();
    expect(fake.calls.filter((call) => call.name === 'kvcoder.job.cancel').map((call) => call.input)).toEqual([{ sessionId: 's1', id: 'r1' }]);
    expect(world.jobs[0]?.status).toBe('cancelled');
    await wrapper.find('[data-test="job-logs-r1"]').trigger('click');
    await flushPromises();
    expect(wrapper.find('[data-test="job-output"]').text()).toBe('Serving HTTP on 0.0.0.0 port 8000');
    expect(wrapper.find('[data-test="job-status"]').text()).toBe('Stopped');
  });

  it('QA3-H18 with no background job, there is no chip', async () => {
    const { mount } = setup([]);
    const wrapper = await mount();
    expect(wrapper.find('[data-test="jobs"]').exists()).toBe(false);
  });

  it('QA67-H15 a running process has Restart and an ended one Run again, each running kvcoder.job.restart; a helper has neither', async () => {
    const { world, fake, mount } = setup([job(), job({ id: 'j2', status: 'succeeded', exitCode: 0, endedAt: '2026-10-01T09:00:30.000Z' }), job({ id: 'h1', kind: 'subagent', title: 'Helper' })]);
    fake.handle('kvcoder.job.restart', (input) => {
      world.jobs = [job({ id: 'j3' }), ...world.jobs];
      return { id: `new-${String(input['id'])}` };
    });
    const wrapper = await mount();
    await wrapper.find('[data-test="jobs-chip"]').trigger('click');
    expect(wrapper.find('[data-test="job-restart-j1"]').text()).toBe('Restart');
    expect(wrapper.find('[data-test="job-restart-j2"]').text()).toBe('Run again');
    expect(wrapper.find('[data-test="job-restart-h1"]').exists()).toBe(false);
    await wrapper.find('[data-test="job-restart-j2"]').trigger('click');
    await flushPromises();
    expect(fake.calls).toContainEqual({ name: 'kvcoder.job.restart', input: { sessionId: 's1', id: 'j2' } });
    expect(wrapper.find('[data-test="job-restart-j3"]').exists()).toBe(true);
  });

  it('M4.8-H13 the chip has its words as label and tooltip, and its count and an icon apart, for ended and running jobs', async () => {
    const ended = setup([job({ status: 'exited', endedAt: '2026-10-01T09:01:00.000Z' })]);
    const quiet = await ended.mount();
    const chip = quiet.find('[data-test="jobs-chip"]');
    expect([chip.attributes('aria-label'), chip.attributes('title'), quiet.find('[data-test="jobs-words"]').text(), quiet.find('[data-test="jobs-count"]').text()]).toEqual(['Background (1)', 'Background (1)', 'Background (1)', '1']);
    expect(chip.find('.kvc-jobs-icon').exists()).toBe(true);
    quiet.unmount();
    const running = setup([job()]);
    const busy = await running.mount();
    expect([busy.find('[data-test="jobs-chip"]').attributes('aria-label'), busy.find('[data-test="jobs-count"]').text()]).toEqual(['1 running', '1']);
    expect(busy.find('[data-test="jobs-chip"] .kvc-dot').exists()).toBe(true);
    busy.unmount();
  });
});
