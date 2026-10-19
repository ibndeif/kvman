import { afterEach, describe, expect, it } from 'vitest';
import SessionList from '../../web/src/SessionList.vue';
import arabic from '../../locales/ar.json' with { type: 'json' };
import { durationText } from '../../web/src/durations.ts';
import { formatCost, tokensUsed, totals } from '../../web/src/kvman.ts';
import { createFakeKvman } from './support/fake-kvman.ts';
import { mounted, session } from './support/fixtures.ts';

afterEach(() => {
  document.documentElement.lang = '';
});

const usage = { input: 1200, output: 300, cost: 0.02 };

describe('times and numbers in the page language (ADR 0009, 132)', () => {
  it('QA58-H9 an hour or more reads in hours and minutes, in English and Arabic', () => {
    const { t } = createFakeKvman().kvman;
    document.documentElement.lang = 'en';
    expect(durationText(t, 3_725_000)).toBe('1 h 2 min');
    expect(totals(t, { cost: 44.01 }, 77_640_000)).toBe('21 h 34 min · $44.01');
    expect(arabic['kvcoder.ui.hoursMinutes']).toBe('{hours} س {minutes} د');
  });

  it('QA58-E15 under an hour is unchanged, and exactly an hour reads 1 h 0 min', () => {
    const { t } = createFakeKvman().kvman;
    document.documentElement.lang = 'en';
    expect(durationText(t, 3_599_000)).toBe('59 min 59 s');
    expect(durationText(t, 3_600_000)).toBe('1 h 0 min');
    expect(totals(t, { cost: 0.5 }, 1_800_000)).toBe('30 min · $0.50');
  });

  it('QA1-H3 the session list and the totals follow the language kvwebui set, not the browser', async () => {
    const fake = createFakeKvman();
    fake.handle('kvcoder.session.list', () => [session({ id: 'a', title: 'Today one', updatedAt: new Date().toISOString() })]);
    document.documentElement.lang = 'ar';
    const wrapper = await mounted(SessionList, fake, {});
    expect(wrapper.find('[data-test="session-a"]').text()).toMatch(/(ص|م)$/u);
    expect(tokensUsed(fake.kvman.t, usage)).toContain('ألف');
    document.documentElement.lang = 'en';
    expect(tokensUsed(fake.kvman.t, usage)).toBe('1.5K tokens used');
    expect(totals(fake.kvman.t, usage, 48_000)).toBe('48 s · $0.02');
    wrapper.unmount();
  });

  it('QA3-E9 costs read well at any size, in the chat header too', () => {
    document.documentElement.lang = 'en';
    expect([0, 1.5, 0.0004181, 0.00004344, 0.5, 0.009].map(formatCost)).toEqual(['$0.00', '$1.50', '$0.0004', '$0.00004', '$0.50', '$0.0090']);
    expect(totals(createFakeKvman().kvman.t, { cost: 0.0004181 }, 3000)).toContain('$0.0004');
    document.documentElement.lang = 'ar';
    expect(formatCost(0.0004181)).toBe(`\u2066${new Intl.NumberFormat('ar', { style: 'currency', currency: 'USD', minimumFractionDigits: 4 }).format(0.0004181)}\u2069`);
  });

  it('QA9-H13 in Arabic a cost is a left-to-right isolate, in English it is as it was', () => {
    document.documentElement.lang = 'ar';
    const arabic = formatCost(0.007);
    expect(arabic.startsWith('\u2066')).toBe(true);
    expect(arabic.endsWith('\u2069')).toBe(true);
    expect(arabic).toContain('0.0070');
    expect(arabic).toContain('US$');
    document.documentElement.lang = 'en';
    expect(formatCost(0.007)).toBe('$0.0070');
  });
});
