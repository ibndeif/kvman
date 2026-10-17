import { flushPromises, mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import ExecutionMap from '../../web/src/ExecutionMap.vue';
import { createFakeKvman } from './support/fake-kvman.ts';
import { executionMap, mapStep, mounted } from './support/fixtures.ts';

describe('the execution map as the person sees it (08 §8.7, ADR 0064)', () => {
  it('M2.4-E230 the goal, the progress, a button per step, the noted findings, and a step\'s details in its dialog', async () => {
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

  it('QA54-H8 and M2.4-E278 the dialog of a step shows its details as Markdown first, and a step without them has no such row', async () => {
    const details = '## Read\n\n- src/settings.ts\n\n```mermaid\ngraph TD; a-->b\n```';
    const map = executionMap([mapStep('read', { details }), mapStep('page', { after: ['read'] })]);
    const fake = createFakeKvman();
    const view = await mounted(ExecutionMap, fake, { map });
    await view.find('[data-test="map-step-read"]').trigger('click');
    expect(view.find('[data-test="map-detail-status"]').text()).toBe('Step · To do');
    expect(view.find('[data-test="map-details"] dt').text()).toBe('Details');
    expect(view.find('[data-test="map-details"] [data-test="markdown"]').text()).toBe(details);
    expect(view.findAll('[data-test="map-detail"] dt').map((label) => label.text())).toEqual(['Details', 'Check']);
    await view.find('[data-test="map-detail-close"]').trigger('click');
    await view.find('[data-test="map-step-page"]').trigger('click');
    expect(view.find('[data-test="map-details"]').exists()).toBe(false);
    expect(view.findAll('[data-test="map-detail"] dt').map((label) => label.text())).toEqual(['After', 'Check']);
    await view.find('[data-test="map-detail-close"]').trigger('click');
    fake.language.value = 'ar';
    await view.find('[data-test="map-step-read"]').trigger('click');
    expect(view.find('[data-test="map-details"] dt').text()).toBe('التفاصيل');
    view.unmount();
  });

  it('M2.4-E271 a press on a step opens a dialog over the page with the focus, and Escape, the backdrop, and Close close it', async () => {
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
    expect(view.find('[data-test="map-detail-status"]').text()).toBe('Step · Done');
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

  it('M2.4-E272 an open dialog follows the step as the map changes, and closes when the map no longer has it', async () => {
    const view = await mounted(ExecutionMap, createFakeKvman(), { map: executionMap([mapStep('read', { status: 'doing' }), mapStep('page', { after: ['read'] })]) });
    await view.find('[data-test="map-step-read"]').trigger('click');
    expect(view.find('[data-test="map-detail-status"]').text()).toBe('Step · In progress');
    await view.setProps({ map: executionMap([mapStep('read', { status: 'done', evidence: 'Read both files.' }), mapStep('page', { after: ['read'] })]) });
    expect(view.find('[data-test="map-detail-status"]').text()).toBe('Step · Done');
    expect(view.find('[data-test="map-evidence"]').text()).toBe('EvidenceRead both files.');
    await view.setProps({ map: executionMap([mapStep('page')]) });
    expect(view.find('[data-test="map-detail"]').exists()).toBe(false);
    await view.setProps({ map: executionMap([mapStep('read'), mapStep('page')]) });
    expect(view.find('[data-test="map-detail"]').exists()).toBe(false);
    view.unmount();
  });
});
