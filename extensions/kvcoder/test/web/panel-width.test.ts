import { flushPromises, mount } from '@vue/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { defineComponent, h } from 'vue';
import ArtifactPanel from '../../web/src/ArtifactPanel.vue';
import PanelResizer from '../../web/src/PanelResizer.vue';
import { draggedWidth, keyWidth, limitedWidth, panelWidthKey, storedWidth, widthLimits } from '../../web/src/panel-width.ts';
import { createFakeKvman } from './support/fake-kvman.ts';
import { artifactContent, artifactSummary, mounted } from './support/fixtures.ts';

afterEach(() => {
  localStorage.clear();
  vi.restoreAllMocks();
  document.body.replaceChildren();
});

const box = (left: number, width: number): DOMRect => new DOMRect(left, 0, width, 600);

// The handle in a panel `panelPx` wide at the inline end of a chat area 1200 px wide, with a 16 px rem.
function handleIn(panelPx: number, direction: 'ltr' | 'rtl') {
  document.documentElement.style.fontSize = '16px';
  const panelBox = direction === 'ltr' ? box(1200 - panelPx, panelPx) : box(0, panelPx);
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function measured(this: HTMLElement) {
    return this.tagName === 'ASIDE' ? panelBox : box(0, 1200);
  });
  const host = defineComponent({ render: () => h('div', [h('aside', { style: { direction } }, [h(PanelResizer)])]) });
  const mountedHost = mount(host, { attachTo: document.body, global: { provide: { kvman: createFakeKvman().kvman } } });
  return { wrapper: mountedHost.findComponent(PanelResizer), handle: mountedHost.find('[data-test="panel-resizer"]'), unmount: () => mountedHost.unmount() };
}

const panelWith = (stored: string) => {
  localStorage.setItem(panelWidthKey, stored);
  return mounted(ArtifactPanel, createFakeKvman(), { list: [artifactSummary({})], shown: 'plan', content: artifactContent({}) });
};

describe("the panel's width (08 §8.7, ADR 0071, 4)", () => {
  it('QA50-H9 Left and Right move the edge 16 px toward their side, mirrored right to left, and a double-click returns to the start', async () => {
    const first = handleIn(480, 'ltr');
    const { wrapper, handle } = first;
    await flushPromises();
    expect(handle.attributes()).toMatchObject({ role: 'separator', 'aria-orientation': 'vertical', tabindex: '0', 'aria-label': 'Resize the panel', 'aria-valuenow': '480', 'aria-valuemin': '320', 'aria-valuemax': '840' });
    await handle.trigger('keydown', { key: 'ArrowLeft' });
    await handle.trigger('keydown', { key: 'ArrowRight' });
    await handle.trigger('keydown', { key: 'ArrowDown' });
    expect(wrapper.emitted('resize')).toEqual([[496], [464]]);
    expect(keyWidth(496, 'ArrowRight', 'ltr')).toBe(480);
    await handle.trigger('dblclick');
    expect(wrapper.emitted('reset')).toEqual([[]]);
    first.unmount();

    const mirrored = handleIn(480, 'rtl');
    await mirrored.handle.trigger('keydown', { key: 'ArrowRight' });
    await mirrored.handle.trigger('keydown', { key: 'ArrowLeft' });
    expect(mirrored.wrapper.emitted('resize')).toEqual([[496], [464]]);
    mirrored.unmount();
    vi.restoreAllMocks();

    const panel = await panelWith('600');
    await panel.find('[data-test="panel-resizer"]').trigger('dblclick');
    expect(localStorage.getItem(panelWidthKey)).toBeNull();
    expect(panel.find('[data-test="artifact-panel"]').attributes()).not.toHaveProperty('style');
    expect(panel.find('[data-test="artifact-panel"]').attributes('data-sized')).toBe('false');
    panel.unmount();
  });

  it('QA50-E5 a drag past either end stops at 20 rem and at 70% of the chat area, and a stored width outside them is shown at the nearest', async () => {
    const limits = widthLimits(1200, 16);
    expect(limits).toEqual({ least: 320, most: 840 });
    expect([limitedWidth(10, limits), limitedWidth(600.4, limits), limitedWidth(2000, limits)]).toEqual([320, 600, 840]);
    expect(widthLimits(400, 16)).toEqual({ least: 320, most: 320 });
    expect(draggedWidth(700, { left: 720, right: 1200 }, 'ltr')).toBe(500);
    expect(draggedWidth(500, { left: 0, right: 480 }, 'rtl')).toBe(500);

    const dragged = handleIn(480, 'ltr');
    const { wrapper, handle } = dragged;
    handle.element.setPointerCapture = vi.fn();
    await handle.trigger('pointermove', { clientX: 600 });
    expect(wrapper.emitted('resize')).toBeUndefined();
    await handle.trigger('pointerdown', { button: 0, pointerId: 1 });
    expect(handle.attributes('data-dragging')).toBe('true');
    for (const clientX of [600, 1190, 20]) await handle.trigger('pointermove', { clientX });
    await handle.trigger('pointerup');
    await handle.trigger('pointermove', { clientX: 700 });
    expect(wrapper.emitted('resize')).toEqual([[600], [320], [840]]);
    expect(handle.attributes('data-dragging')).toBe('false');
    dragged.unmount();
    vi.restoreAllMocks();

    for (const stored of ['2000', '10']) {
      const panel = await panelWith(stored);
      expect(panel.find('[data-test="artifact-panel"]').attributes()).toMatchObject({ 'data-sized': 'true', style: `--kvc-panel-width: ${stored}px;` });
      panel.unmount();
    }
  });

  it("QA50-E6 a stored width that isn't a whole number isn't used", async () => {
    expect(['abc', '12.5', '-40', '', null].map(storedWidth)).toEqual([undefined, undefined, undefined, undefined, undefined]);
    expect(storedWidth('600')).toBe(600);
    for (const stored of ['abc', '12.5', '-40']) {
      const panel = await panelWith(stored);
      expect(panel.find('[data-test="artifact-panel"]').attributes('data-sized'), stored).toBe('false');
      panel.unmount();
    }
  });
});
