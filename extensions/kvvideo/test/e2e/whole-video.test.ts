import { execFileSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';
import { useKvvideo } from '../support/kvvideo-kernel.ts';
import { useTestPages } from '../support/test-page.ts';

// The whole video by hand (plan 16 §16.12; M5.11-H3), the part that runs here: Chrome and the ffmpeg on the PATH make
// a video of a title page, a website in a window and on a phone, and an image, with the camera, overlays, every
// transition, sound effects, and Arabic and English captions, once in each caption style, and `review` looks at each.

const kvvideo = useKvvideo();
const pages = useTestPages();

const title = `<!doctype html><html lang="ar" dir="rtl"><head><style>
body { margin: 0; height: 100vh; display: grid; place-items: center; background: linear-gradient(135deg, #0f172a, #1e3a8a); font-family: sans-serif; }
h1 { color: #f8fafc; font-size: 64px; animation: rise .5s ease-out both; }
@keyframes rise { from { opacity: 0; transform: translateY(24px); } to { opacity: 1; transform: none; } }
</style></head><body><h1 dir="auto">ملاحظاتي</h1></body></html>`;

const caption = (text: string, endMs: number) => ({ text, startMs: 0, endMs, words: text.split(' ').map((word, index, all) => ({ text: word, startMs: Math.floor((index * endMs) / all.length), endMs: Math.floor(((index + 1) * endMs) / all.length) })) });

describe('the whole video by hand (16 §16.12)', () => {
  it('M5.11-H3 a title page, a website in a window and on a phone, and an image, composed with Arabic and English captions in each style and reviewed', async () => {
    const { kernel, workspace, write } = await kvvideo.start({ settings: { 'kvvideo.browser': 'chrome' } });
    const app = await pages.app();
    write('videos/whole/title.html', title);
    execFileSync('ffmpeg', ['-v', 'error', '-f', 'lavfi', '-i', 'testsrc2=s=1280x720', '-frames:v', '1', '-y', `${workspace}/videos/whole/photo.png`]);
    execFileSync('ffmpeg', ['-v', 'error', '-f', 'lavfi', '-i', 'sine=frequency=330:duration=2', '-af', 'volume=-18dB', '-y', `${workspace}/videos/whole/voice.wav`]);
    const size = { width: 640, height: 360 };
    await kernel.exec('kvvideo.clip.record', { page: 'videos/whole/title.html', file: 'videos/whole/title.mp4', ...size, steps: [{ do: 'wait', ms: 1500 }] });
    const steps = [{ do: 'type' as const, target: 'role=textbox[name="Name"]', text: 'Sam' }, { do: 'click' as const, target: 'text=Save' }, { do: 'wait' as const, ms: 800 }];
    await kernel.exec('kvvideo.clip.record', { url: app.url, file: 'videos/whole/site.mp4', ...size, steps });
    await kernel.exec('kvvideo.clip.record', { url: app.url, file: 'videos/whole/phone.mp4', device: 'phone', steps });
    const scenes = [
      { clip: 'videos/whole/title.mp4', durationMs: 2000, captions: [caption('مرحبا بك في ملاحظاتي', 2000)] },
      { clip: 'videos/whole/site.mp4', narration: 'videos/whole/voice.wav', captions: [caption('اكتب اسمك ثم احفظ', 2000)], transition: { kind: 'slide' as const }, overlays: [{ kind: 'callout' as const, step: 2, text: 'احفظ', fromMs: 800, toMs: 2400 }, { kind: 'highlight' as const, step: 1, fromMs: 0, toMs: 700 }, { kind: 'blur' as const, box: { x: 0, y: 0, width: 120, height: 40 }, fromMs: 0, toMs: 2600 }] },
      { clip: 'videos/whole/phone.mp4', durationMs: 2500, captions: [caption('وعلى الهاتف أيضا', 2500)], transition: { kind: 'fade-black' as const } },
      { clip: 'videos/whole/photo.png', durationMs: 2000, captions: [caption("A photo from the app's owner", 2000)], transition: { kind: 'cut' as const } },
      { clip: 'videos/whole/title.mp4', durationMs: 1500, captions: [caption('شكرا للمشاهدة', 1500)] },
    ];
    for (const style of ['boxed', 'outline', 'highlight', 'off'] as const) {
      const file = `videos/whole/video-${style}.mp4`;
      const made = await kernel.exec('kvvideo.video.compose', { file, ...size, captions: { style }, scenes });
      expect(made.durationMs).toBeGreaterThan(8000);
      const review = await kernel.exec('kvvideo.video.review', { file });
      expect(review.problems.filter((problem) => problem.kind === 'black'), style).toEqual([]);
      expect(review.images.length).toBeGreaterThan(0);
    }
  });
});
