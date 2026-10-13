import { flushPromises, mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import ExecutionMap from '../../web/src/ExecutionMap.vue';
import { createFakeKvman } from './support/fake-kvman.ts';
import { executionMap, mapStep, mounted } from './support/fixtures.ts';

describe('the execution map as the person sees it (08 §8.7, ADR 0064)', () => {
  it('M2.4-E230 the goal, the progress, a button per task, the noted findings, and a task\'s details in its dialog', async () => {
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
    await view.find('[data-test="map-detail-close"]').trigger('click');
    await view.find('[data-test="map-step-test"]').trigger('click');
    expect(view.find('[data-test="map-after"]').text()).toBe('AfterDo store · Do page');
    expect(view.find('[data-test="map-note"]').text()).toContain('The date field is wrong.');
  });

  it('M2.4-E261 and E270 the dialog of a task shows its description first, and a task without one has no such row', async () => {
    const map = executionMap([mapStep('read', { description: 'Read src/settings.ts and its test, and list what the page needs.' }), mapStep('page', { after: ['read'] })]);
    const view = await mounted(ExecutionMap, createFakeKvman(), { map });
    await view.find('[data-test="map-step-read"]').trigger('click');
    expect(view.find('[data-test="map-detail-status"]').text()).toBe('Task · To do');
    expect(view.find('[data-test="map-description"]').text()).toBe('AboutRead src/settings.ts and its test, and list what the page needs.');
    expect(view.findAll('[data-test="map-detail"] dt').map((label) => label.text())).toEqual(['About', 'Check']);
    await view.find('[data-test="map-detail-close"]').trigger('click');
    await view.find('[data-test="map-step-page"]').trigger('click');
    expect(view.find('[data-test="map-description"]').exists()).toBe(false);
    expect(view.findAll('[data-test="map-detail"] dt').map((label) => label.text())).toEqual(['After', 'Check']);
    view.unmount();
  });

  it('M2.4-E271 a press on a task opens a dialog over the page with the focus, and Escape, the backdrop, and Close close it', async () => {
    const map = executionMap([mapStep('read', { uses: 'fs', status: 'done', evidence: 'Read both files.' }), mapStep('page', { after: ['read'] })]);
    const view = mount(ExecutionMap, { props: { map }, attachTo: document.body, global: { provide: { kvman: createFakeKvman().kvman } } });
    await flushPromises();
    const task = view.find('[data-test="map-step-read"]');
    expect(task.attributes('aria-haspopup')).toBe('dialog');
    const opened = async () => {
      await task.trigger('click');
      return view.find('[data-test="map-detail"]');
    };
    const dialog = await opened();
    expect(dialog.attributes()).toMatchObject({ role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Do read' });
    expect(document.activeElement).toBe(dialog.element);
    expect(view.find('[data-test="map-detail-title"]').text()).toBe('Do read');
    expect(view.find('[data-test="map-detail-status"]').text()).toBe('Task · Done');
    expect(dialog.findAll('dt').map((label) => label.text())).toEqual(['Uses', 'Check', 'Evidence']);
    expect(view.find('[data-test="map-detail-close"]').attributes('aria-label')).toBe('Close');
    await dialog.trigger('keydown', { key: 'Escape' });
    expect(view.find('[data-test="map-detail"]').exists()).toBe(false);
    await opened();
    await view.find('[data-test="map-detail-backdrop"]').trigger('click');
    expect(view.find('[data-test="map-detail"]').exists()).toBe(false);
    await opened();
    await view.find('[data-test="map-detail-close"]').trigger('click');
    expect(view.find('[data-test="map-detail"]').exists()).toBe(false);
    view.unmount();
  });

  it('M2.4-E272 an open dialog follows the task as the map changes, and closes when the map no longer has it', async () => {
    const view = await mounted(ExecutionMap, createFakeKvman(), { map: executionMap([mapStep('read', { status: 'doing' }), mapStep('page', { after: ['read'] })]) });
    await view.find('[data-test="map-step-read"]').trigger('click');
    expect(view.find('[data-test="map-detail-status"]').text()).toBe('Task · In progress');
    await view.setProps({ map: executionMap([mapStep('read', { status: 'done', evidence: 'Read both files.' }), mapStep('page', { after: ['read'] })]) });
    expect(view.find('[data-test="map-detail-status"]').text()).toBe('Task · Done');
    expect(view.find('[data-test="map-evidence"]').text()).toBe('EvidenceRead both files.');
    await view.setProps({ map: executionMap([mapStep('page')]) });
    expect(view.find('[data-test="map-detail"]').exists()).toBe(false);
    await view.setProps({ map: executionMap([mapStep('read'), mapStep('page')]) });
    expect(view.find('[data-test="map-detail"]').exists()).toBe(false);
    view.unmount();
  });
});
