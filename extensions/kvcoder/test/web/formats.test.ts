import { afterEach, describe, expect, it } from 'vitest';
import SessionList from '../../web/src/SessionList.vue';
import { totals } from '../../web/src/kvman.ts';
import { createFakeKvman } from './support/fake-kvman.ts';
import { mounted, session } from './support/fixtures.ts';

afterEach(() => {
  document.documentElement.lang = '';
});

const usage = { input: 1200, output: 300, cost: 0.02 };

describe('times and numbers in the page language (ADR 0009, 132)', () => {
  it('QA1-H3 the session list and the totals follow the language kvwebui set, not the browser', async () => {
    const fake = createFakeKvman();
    fake.handle('kvcoder.session.list', () => [session({ id: 'a', title: 'Today one', updatedAt: new Date().toISOString() })]);
    document.documentElement.lang = 'ar';
    const wrapper = await mounted(SessionList, fake, {});
    expect(wrapper.find('[data-test="session-a"]').text()).toMatch(/(ص|م)$/u);
    expect(totals(fake.kvman.t, usage, 48_000)).toContain('ألف');
    document.documentElement.lang = 'en';
    expect(totals(fake.kvman.t, usage, 48_000)).toContain('1.5K');
    wrapper.unmount();
  });
});
