import { flushPromises, mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import Player from '../../web/components/player.vue';
import ar from '../../locales/ar.json' with { type: 'json' };
import en from '../../locales/en.json' with { type: 'json' };

// The player mounted with the parts of kvwebui's `kvman` it reads: `t`, with kvvideo's real catalogs, and the tab's
// workspace.

const catalogs: Record<'en' | 'ar', Record<string, string>> = { en, ar };

function kvmanIn(language: 'en' | 'ar') {
  const t = (key: string, params: Record<string, unknown> = {}): string => (catalogs[language][key] ?? key).replace(/\{(\w+)\}/g, (_match, name: string) => String(params[name] ?? ''));
  return { t, workspace: { value: { id: 'w1', name: 'Notes', path: '/w' } } };
}

const output = { file: 'videos/tour.mp4', durationMs: 125_400, bytes: 1000, fileId: 'f 1' };

async function mounted(shown: Record<string, unknown>, language: 'en' | 'ar' = 'en') {
  const wrapper = mount(Player, { props: { payload: {}, output: shown }, global: { provide: { kvman: kvmanIn(language) } } });
  await flushPromises();
  return wrapper;
}

describe("compose's card (16 §16.8)", () => {
  it('M5.4-H9 it shows the path, the length, and a video of the copy in the tab workspace', async () => {
    const wrapper = await mounted(output);
    expect(wrapper.find('[data-test="file"]').text()).toBe('videos/tour.mp4');
    expect(wrapper.find('[data-test="length"]').text()).toBe('2:05');
    const video = wrapper.find('[data-test="video"]');
    expect(video.attributes('src')).toBe('/api/files/f%201?workspaceId=w1');
    expect(video.attributes('controls')).toBeDefined();
    expect(video.attributes('preload')).toBe('metadata');
    expect(wrapper.find('[data-test="unavailable"]').exists()).toBe(false);
  });

  it("M5.4-E10 without a copy, or when the video can't load, it says to open the file, in both languages", async () => {
    const none = await mounted({ ...output, fileId: null });
    expect(none.find('[data-test="video"]').exists()).toBe(false);
    expect(none.find('[data-test="unavailable"]').text()).toBe("This video can't play here. Open videos/tour.mp4 in the workspace.");
    const broken = await mounted(output, 'ar');
    await broken.find('[data-test="video"]').trigger('error');
    expect(broken.find('[data-test="video"]').exists()).toBe(false);
    expect(broken.find('[data-test="unavailable"]').text()).toBe('لا يمكن تشغيل هذا الفيديو هنا. افتح videos/tour.mp4 في مساحة العمل.');
  });
});
