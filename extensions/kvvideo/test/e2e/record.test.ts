import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { ProblemError, z } from '@kvman/sdk';
import { cursorScript } from '../../src/record/cursor-script.ts';
import { countsFrames, useFakePrograms } from '../support/fake-programs.ts';
import { useKvvideo } from '../support/kvvideo-kernel.ts';
import { useTestPages } from '../support/test-page.ts';

const kvvideo = useKvvideo();
const programs = useFakePrograms();
const pages = useTestPages();

const encoded = z.object({ frames: z.number(), width: z.number(), height: z.number(), args: z.array(z.string()) });

async function world() {
  const ffmpeg = programs.program('ffmpeg', countsFrames);
  return { ffmpeg, ...(await kvvideo.start({ settings: { 'kvvideo.browser': 'chrome', 'kvvideo.programs.ffmpeg': ffmpeg } })) };
}

function alive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

const problemOf = (run: Promise<unknown>): Promise<unknown> =>
  run.then(
    () => undefined,
    (error: unknown) => (error instanceof ProblemError ? error.problem : error),
  );

describe('video record with the installed Chrome (16 §16.5)', () => {
  it('M5.2-H1 every kind of step runs, frames reach ffmpeg at 30 a second, and the timings are answered', async () => {
    const { kernel, workspace } = await world();
    const app = await pages.app();
    const steps = [
      { do: 'waitFor', target: '#late' },
      { do: 'type', target: 'role=textbox[name="Name"]', text: 'Sam' },
      { do: 'press', key: 'Tab' },
      { do: 'click', target: 'text=Save' },
      { do: 'hover', target: '#next' },
      { do: 'scroll', pixels: 600 },
      { do: 'scroll', pixels: -600 },
      { do: 'wait', ms: 300 },
      { do: 'goto', url: `${app.url}second` },
    ] as const;
    const answer = await kernel.exec('kvvideo.clip.record', { url: app.url, file: 'videos/demo/01.mp4', width: 640, height: 360, steps: [...steps] });
    expect(answer.file).toBe('videos/demo/01.mp4');
    expect(answer.steps.map((step) => step.do)).toEqual(steps.map((step) => step.do));
    const times = answer.steps.map((step) => step.atMs);
    expect(times[0]).toBeGreaterThanOrEqual(500);
    expect(times.every((time, index) => index === 0 || time > (times[index - 1] ?? 0))).toBe(true);
    expect(answer.durationMs - (times.at(-1) ?? 0)).toBeGreaterThanOrEqual(1000);
    expect(app.saved).toEqual(['Sam']);
    expect(app.requests).toContain('/second');
    const output = encoded.parse(JSON.parse(readFileSync(`${workspace}/videos/demo/01.mp4`, 'utf8')));
    expect({ width: output.width, height: output.height }).toEqual({ width: 640, height: 360 });
    expect(Math.abs(output.frames - Math.round((answer.durationMs * 30) / 1000))).toBeLessThanOrEqual(1);
    expect(output.args.slice(0, 11)).toEqual(['-hide_banner', '-loglevel', 'error', '-f', 'image2pipe', '-framerate', '30', '-c:v', 'mjpeg', '-i', '-']);
  });

  it('M5.2-H2 the default size, and the folders made', async () => {
    const { kernel, workspace } = await world();
    const app = await pages.app();
    await kernel.exec('kvvideo.clip.record', { url: app.url, file: 'a/b/c.mp4' });
    const output = encoded.parse(JSON.parse(readFileSync(`${workspace}/a/b/c.mp4`, 'utf8')));
    expect({ width: output.width, height: output.height }).toEqual({ width: 1280, height: 720 });
    expect(output.args).toContain('scale=1280:720:force_original_aspect_ratio=decrease,pad=1280:720:(ow-iw)/2:(oh-ih)/2:color=black,format=yuv420p');
  });

  it('M5.2-H4 replace writes over an existing file', async () => {
    const { kernel, write, workspace } = await world();
    const app = await pages.app();
    write('clip.mp4', 'old');
    await kernel.exec('kvvideo.clip.record', { url: app.url, file: 'clip.mp4', replace: true });
    expect(readFileSync(`${workspace}/clip.mp4`, 'utf8')).toContain('"frames"');
  });

  it("M5.2-E3 the page's requests to kvman's own address are aborted", async () => {
    const own = await pages.counter();
    const home = mkdtempSync(path.join(tmpdir(), 'kvvideo-home-'));
    writeFileSync(path.join(home, 'kvman.lock'), JSON.stringify({ pid: process.pid, port: own.port }));
    process.env['KVMAN_HOME'] = home;
    try {
      const { kernel, workspace } = await world();
      const app = await pages.app();
      await kernel.exec('kvvideo.clip.record', { url: `${app.url}fetch/${String(own.port)}`, file: 'own.mp4', steps: [{ do: 'waitFor', target: 'text=blocked' }] });
      expect(existsSync(`${workspace}/own.mp4`)).toBe(true);
      expect(own.requests).toEqual([]);
    } finally {
      delete process.env['KVMAN_HOME'];
      rmSync(home, { recursive: true, force: true });
    }
  });

  it('M5.2-E3 the same page reaches another port', async () => {
    const other = await pages.counter();
    const { kernel } = await world();
    const app = await pages.app();
    await kernel.exec('kvvideo.clip.record', { url: `${app.url}fetch/${String(other.port)}`, file: 'other.mp4', steps: [{ do: 'waitFor', target: 'text=reached' }] });
    expect(other.requests).toEqual(['/ping']);
  });

  it('M5.2-H3 the cursor is drawn: a dot follows the mouse, and a press adds a ring', async () => {
    const { chromium } = await import('playwright-core');
    const browser = await chromium.launch({ channel: 'chrome', headless: true });
    try {
      const page = await browser.newPage();
      await page.addInitScript(cursorScript);
      await page.goto((await pages.app()).url);
      await page.mouse.move(120, 80);
      expect(await page.locator('#kvvideo-cursor').getAttribute('style')).toContain('translate(120px, 80px)');
      await page.mouse.down();
      expect(await page.locator('.kvvideo-ring').count()).toBe(1);
      await page.mouse.up();
    } finally {
      await browser.close();
    }
  });

  it('M5.2-E9 cancel stops the browser and ffmpeg, and writes nothing', async () => {
    const { kernel, workspace, ffmpeg } = await world();
    const app = await pages.app();
    const jobId = await kernel.execAsync('kvvideo.clip.record', { url: app.url, file: 'cancelled.mp4', steps: [{ do: 'wait', ms: 60_000 }] });
    await expect.poll(() => existsSync(`${ffmpeg}.pid`), { timeout: 30_000 }).toBe(true);
    const pid = Number(readFileSync(`${ffmpeg}.pid`, 'utf8'));
    kernel.cancel(jobId);
    expect((await kernel.waitForJob(jobId)).status).toBe('cancelled');
    await expect.poll(() => alive(pid), { timeout: 5_000 }).toBe(false);
    expect(existsSync(`${workspace}/cancelled.mp4`)).toBe(false);
  });

  it('M5.2-E4 a target that never appears fails STEP_FAILED with its number; nothing is written', async () => {
    const { kernel, workspace } = await world();
    const app = await pages.app();
    const problem = await problemOf(kernel.exec('kvvideo.clip.record', { url: app.url, file: 'missing.mp4', steps: [{ do: 'wait', ms: 0 }, { do: 'click', target: '#missing' }] }));
    expect(problem).toMatchObject({ code: 'kvvideo/STEP_FAILED', params: { step: 2 } });
    expect(String((problem as { params: { reason: string } }).params.reason)).not.toContain('\n');
    expect(readdirSync(workspace).filter((name) => name.includes('missing'))).toEqual([]);
  });

  it("M5.2-E5 a page that doesn't load fails STEP_FAILED with step 0", async () => {
    const { kernel, workspace } = await world();
    const port = await pages.closedPort();
    expect(await problemOf(kernel.exec('kvvideo.clip.record', { url: `http://127.0.0.1:${String(port)}/`, file: 'none.mp4' }))).toMatchObject({ code: 'kvvideo/STEP_FAILED', params: { step: 0 } });
    expect(existsSync(`${workspace}/none.mp4`)).toBe(false);
  });

  it('M5.2-E11 an ffmpeg that fails, or that cannot start', async () => {
    const app = await pages.app();
    const failing = await kvvideo.start({ settings: { 'kvvideo.browser': 'chrome', 'kvvideo.programs.ffmpeg': programs.program('ffmpeg', "process.stdin.resume(); console.error(\"Unknown encoder 'libx264'\"); process.exit(1);") } });
    expect(await problemOf(failing.kernel.exec('kvvideo.clip.record', { url: app.url, file: 'bad.mp4' }))).toMatchObject({ code: 'kvvideo/RENDER_FAILED', params: { reason: "Unknown encoder 'libx264'" } });
    expect(existsSync(`${failing.workspace}/bad.mp4`)).toBe(false);
    const missing = await kvvideo.start({ settings: { 'kvvideo.browser': 'chrome', 'kvvideo.programs.ffmpeg': '/nowhere/ffmpeg' } });
    expect(await problemOf(missing.kernel.exec('kvvideo.clip.record', { url: app.url, file: 'bad.mp4' }))).toMatchObject({ code: 'kvvideo/PROGRAM_MISSING', params: { program: 'ffmpeg' } });
  });
});
