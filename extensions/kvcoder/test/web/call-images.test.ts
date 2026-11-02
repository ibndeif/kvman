import { describe, expect, it } from 'vitest';
import CallCard from '../../web/src/CallCard.vue';
import ActivityLine from '../../web/src/ActivityLine.vue';
import { callView } from '../../web/src/call-view.ts';
import { idleLive } from '../../web/src/live-step.ts';
import { createFakeKvman } from './support/fake-kvman.ts';
import { mounted } from './support/fixtures.ts';

describe("a result's images and a running call's progress (08 §8.4 and §8.7, ADR 0115, 46 and 47)", () => {
  it('M5.9-H2 the opened card shows the images as thumbnails that open at full size in a new tab', async () => {
    const images = [
      { fileId: 'f1', name: 'review-1.jpg', url: '/api/files/f1?workspaceId=w1' },
      { fileId: 'f2', name: 'review-2.jpg', url: '/api/files/f2?workspaceId=w1' },
    ];
    const card = await mounted(CallCard, createFakeKvman(), { view: callView({ connector: 'video', command: 'review', payload: { file: 'a.mp4' } }), output: '{"problems":[]}', images });
    expect(card.find('[data-test="call-images"]').exists()).toBe(false);
    await card.find('button').trigger('click');
    const links = card.findAll('[data-test="call-image"]');
    expect(links.map((link) => [link.attributes('href'), link.attributes('target'), link.find('img').attributes('src'), link.find('img').attributes('alt')])).toEqual([
      ['/api/files/f1?workspaceId=w1', '_blank', '/api/files/f1?workspaceId=w1', 'review-1.jpg'],
      ['/api/files/f2?workspaceId=w1', '_blank', '/api/files/f2?workspaceId=w1', 'review-2.jpg'],
    ]);
  });

  it('M5.9-H3 the activity line shows a call’s progress, translated with its params', async () => {
    const live = { ...idleLive(), calls: [{ name: 'run', label: 'video · compose', connector: 'video', command: 'compose', complete: true, progress: { key: 'kvcoder.ui.map.progress', params: { done: 2, total: 3 } } }] };
    const line = await mounted(ActivityLine, createFakeKvman(), { live });
    expect(line.find('[data-test="activity-progress"]').text()).toBe('2 of 3 done');
  });
});
