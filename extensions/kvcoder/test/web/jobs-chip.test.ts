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
  it('QA3-H18 the chip counts running jobs, its list shows links, logs, and Stop, and it is hidden with none running', async () => {
    const { world, fake, mount } = setup([job({ links: ['http://localhost:8000'] })]);
    const wrapper = await mount();
    expect(wrapper.find('[data-test="jobs-chip"]').text()).toBe('1 running');
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
    expect(wrapper.find('[data-test="jobs-chip"]').text()).toBe('0 running');

    await wrapper.find('[data-test="jobs-popover"]').trigger('keydown', { key: 'Escape' });
    expect(wrapper.find('[data-test="jobs"]').exists()).toBe(false);
    expect(world.jobs[0]?.status).toBe('cancelled');
  });

  it('QA3-E21 the list is read again every 5 s while a job runs, and the chip goes when it ended', async () => {
    const { world, fake, mount } = setup([job()]);
    const wrapper = await mount();
    const reads = () => fake.calls.filter((call) => call.name === 'kvcoder.job.list').length;
    expect(reads()).toBe(1);
    await vi.advanceTimersByTimeAsync(5_000);
    expect(reads()).toBe(2);
    world.jobs = [job({ status: 'failed', exitCode: 1 })];
    await vi.advanceTimersByTimeAsync(5_000);
    await flushPromises();
    expect(wrapper.find('[data-test="jobs"]').exists()).toBe(false);
    await vi.advanceTimersByTimeAsync(10_000);
    expect(reads()).toBe(3);
  });

  it('QA3-H18 with nothing running, there is no chip', async () => {
    const { mount } = setup([job({ status: 'succeeded', exitCode: 0 })]);
    const wrapper = await mount();
    expect(wrapper.find('[data-test="jobs"]').exists()).toBe(false);
  });
});
