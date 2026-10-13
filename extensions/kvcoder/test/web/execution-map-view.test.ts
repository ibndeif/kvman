import { describe, expect, it } from 'vitest';
import ExecutionMap from '../../web/src/ExecutionMap.vue';
import { createFakeKvman } from './support/fake-kvman.ts';
import { executionMap, mapStep, mounted } from './support/fixtures.ts';

describe('the execution map as the person sees it (08 §8.7, ADR 0064)', () => {
  it('M2.4-E230 the goal, the progress, a button per step, the noted findings, and a step\'s details on a press', async () => {
    const map = executionMap(
      [
        mapStep('read', { status: 'done', evidence: 'Read src/settings.ts and its test.' }),
        mapStep('store', { after: ['read'], status: 'skipped', note: 'The store exists.' }),
        mapStep('page', { after: ['read'], status: 'doing', uses: 'fs' }),
        mapStep('test', { after: ['store', 'page'], status: 'failed', note: 'The date field is wrong.' }),
      ],
      { notes: [{ text: 'The date parser takes two-digit years.', createdAt: '2026-10-01T09:00:00.000Z' }] },
    );
    const view = await mounted(ExecutionMap, createFakeKvman(), { map });
    expect(view.find('[data-test="map-goal"]').text()).toBe('Ship the settings page');
    expect(view.find('[data-test="map-progress"]').text()).toBe('2 of 4 done');
    const steps = view.findAll('[data-test^="map-step-"]');
    expect(steps.map((step) => [step.attributes('data-status'), step.attributes('aria-label')])).toEqual([['done', 'Do read: Done'], ['skipped', 'Do store: Skipped'], ['doing', 'Do page: In progress'], ['failed', 'Do test: Failed']]);
    expect(view.findAll('[data-test="map-edge"]')).toHaveLength(4);
    expect(view.find('[data-test="map-noted"]').text()).toBe('Noted for later (1)The date parser takes two-digit years.');
    expect(view.find('[data-test="map-detail"]').exists()).toBe(false);
    await view.find('[data-test="map-step-read"]').trigger('click');
    expect(view.find('[data-test="map-detail"]').text()).toContain('check read');
    expect(view.find('[data-test="map-evidence"]').text()).toContain('Read src/settings.ts and its test.');
    expect(view.find('[data-test="map-note"]').exists()).toBe(false);
    await view.find('[data-test="map-step-test"]').trigger('click');
    expect(view.find('[data-test="map-detail"]').text()).toContain('Do store · Do page');
    expect(view.find('[data-test="map-note"]').text()).toContain('The date field is wrong.');
    await view.find('[data-test="map-step-test"]').trigger('click');
    expect(view.find('[data-test="map-detail"]').exists()).toBe(false);
  });

  it('M2.4-E261 a press on a step shows its description first, and a step without one has no such row', async () => {
    const map = executionMap([mapStep('read', { description: 'Read src/settings.ts and its test, and list what the page needs.' }), mapStep('page', { after: ['read'] })]);
    const view = await mounted(ExecutionMap, createFakeKvman(), { map });
    await view.find('[data-test="map-step-read"]').trigger('click');
    expect(view.find('[data-test="map-description"]').text()).toBe('AboutRead src/settings.ts and its test, and list what the page needs.');
    expect(view.findAll('[data-test="map-detail"] dt').map((label) => label.text())).toEqual(['Step', 'About', 'Check']);
    await view.find('[data-test="map-step-page"]').trigger('click');
    expect(view.find('[data-test="map-description"]').exists()).toBe(false);
  });
});
