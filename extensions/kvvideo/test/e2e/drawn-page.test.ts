import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { boxCenter, slidingBox } from '../support/box-position.ts';
import { useKvvideo } from '../support/kvvideo-kernel.ts';

// Pages drawn frame by frame on kvvideo's clock (plan 16 §16.5; ADR 0120, 2, 5, 11, 13 to 17, and 21) with the
// installed Chrome and the ffmpeg on the PATH: the frames, their sameness, scripts and three.js on the clock, sound
// cues, timers, and a page with a click still recorded in real time.

const kvvideo = useKvvideo();

const probe = (file: string, entry: string): string => execFileSync('ffprobe', ['-v', 'error', '-count_frames', '-select_streams', 'v:0', '-show_entries', `stream=${entry}`, '-of', 'csv=p=0', file], { encoding: 'utf8' }).trim().replace(/,+$/, '');
const frameHashes = (file: string): string[] => execFileSync('ffmpeg', ['-v', 'error', '-i', file, '-f', 'framemd5', '-'], { encoding: 'utf8' }).split('\n').filter((line) => line !== '' && !line.startsWith('#')).map((line) => line.split(',').at(-1)?.trim() ?? '');

function brightness(file: string, x: number, y: number, seconds?: number): number {
  const at = seconds === undefined ? [] : ['-ss', seconds.toFixed(3)];
  return [...execFileSync('ffmpeg', ['-v', 'error', ...at, '-i', file, '-frames:v', '1', '-vf', `scale=640:-2,format=gray,crop=1:1:${String(x)}:${String(y)}`, '-f', 'rawvideo', '-pix_fmt', 'gray', '-'])][0] ?? -1;
}

const scripted = `<!doctype html><html><head><style>body { margin: 0; background: #000; } #box { position: absolute; top: 100px; left: 0; height: 100px; background: #fff; }</style></head>
<body><div id="box"></div><script>
const box = document.getElementById('box');
box.style.width = Math.round(40 + Math.random() * 60) + 'px';
setTimeout(() => { box.style.background = '#c0c0c0'; }, 500);
const move = () => { box.style.transform = 'translateX(' + (performance.now() * 0.3) + 'px)'; requestAnimationFrame(move); };
requestAnimationFrame(move);
</script></body></html>`;

const turning = `<!doctype html><html><head><style>body { margin: 0; background: #000; }</style>
<script type="importmap">{ "imports": { "three": "./kvvideo/lib/three/build/three.module.js" } }</script></head><body>
<script type="module">
import * as THREE from 'three';
const renderer = new THREE.WebGLRenderer();
renderer.setSize(innerWidth, innerHeight);
document.body.appendChild(renderer.domElement);
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(50, innerWidth / innerHeight, 0.1, 100);
camera.position.z = 4;
const cube = new THREE.Mesh(new THREE.BoxGeometry(1.5, 1.5, 1.5), new THREE.MeshNormalMaterial());
scene.add(cube);
renderer.setAnimationLoop((time) => { cube.rotation.set(time / 700, time / 900, 0); renderer.render(scene, camera); });
</script></body></html>`;

const cued = `<!doctype html><html><head><style>
body { margin: 0; background: #000; } div { width: 40px; height: 40px; background: #fff; }
@keyframes in { from { opacity: 0; } } @keyframes loop { to { transform: rotate(360deg); } }
</style></head><body>
<div data-sound="pop" style="animation: in 300ms 1.2s both"></div>
<div data-sound="boom" style="animation: in 300ms 0.5s both"></div>
<div data-sound="click" style="animation: loop 1s linear infinite"></div>
</body></html>`;

const timers = `<!doctype html><html><head><style>body { margin: 0; background: #000; } div { position: absolute; height: 40px; }</style></head><body>
<div id="count" style="left: 0; top: 0; background: #fff; width: 0"></div>
<div id="cleared" style="left: 0; top: 100px; width: 40px"></div>
<div id="marked" style="left: 0; top: 200px; width: 40px"></div>
<script>
let count = 0;
setInterval(() => { count += 1; document.getElementById('count').style.width = (count * 20) + 'px'; }, 200);
const cleared = setTimeout(() => { document.getElementById('cleared').style.background = '#fff'; }, 300);
clearTimeout(cleared);
setTimeout(() => { throw new Error('a failing callback'); }, 100);
setTimeout(() => { document.getElementById('marked').style.background = '#fff'; }, 150);
</script></body></html>`;

async function world() {
  const started = await kvvideo.start({ settings: { 'kvvideo.browser': 'chrome' } });
  return { ...started, stored: (fileId: string): string => `${started.kernel.home}/files/${fileId}` };
}

describe('pages drawn frame by frame (16 §16.5, ADR 0120)', () => {
  it('M5.15-H1 M5.15-H2 M5.15-H12 a page of waits is drawn at 60 frames a second, each frame distinct, the same twice, its frames reported', async () => {
    const { kernel, write, workspace } = await world();
    write('v/slide.html', slidingBox(2));
    const chunks: unknown[] = [];
    const answer = await kernel.exec('kvvideo.clip.record', { page: 'v/slide.html', file: 'v/a.mp4', width: 1280, height: 720, steps: [{ do: 'wait', ms: 1000 }] }, { onProgress: (chunk) => chunks.push(chunk) });
    expect(answer.durationMs).toBe(2500);
    expect(answer.steps).toEqual([{ do: 'wait', atMs: 500, endMs: 1500 }]);
    const file = `${workspace}/v/a.mp4`;
    expect(probe(file, 'r_frame_rate')).toBe('60/1');
    expect(probe(file, 'nb_read_frames')).toBe('150');
    const hashes = frameHashes(file);
    expect(hashes.slice(1, 120).every((hash, index) => hash !== hashes[index])).toBe(true);
    expect(JSON.parse(readFileSync(`${file}.kvvideo.json`, 'utf8'))).toMatchObject({ kind: 'page', drawn: true, sounds: [] });
    expect(chunks.map((chunk) => (chunk as { data: { params: unknown } }).data.params)).toEqual([30, 60, 90, 120, 150].map((n) => ({ n, of: 150 })));
    await kernel.exec('kvvideo.clip.record', { page: 'v/slide.html', file: 'v/b.mp4', width: 1280, height: 720, steps: [{ do: 'wait', ms: 1000 }] });
    expect(frameHashes(`${workspace}/v/b.mp4`)).toEqual(hashes);
  });

  it('M5.15-H3 scripts run on the clock, alike in look and record', async () => {
    const { kernel, write, workspace, stored } = await world();
    write('v/scripted.html', scripted);
    const look = await kernel.exec('kvvideo.frame.capture', { page: 'v/scripted.html', atMs: [1000], width: 640, height: 360 });
    await kernel.exec('kvvideo.clip.record', { page: 'v/scripted.html', file: 'v/scripted.mp4', width: 640, height: 360, steps: [{ do: 'wait', ms: 500 }] });
    const looked = stored(look.images[0]?.fileId ?? '');
    const recorded = `${workspace}/v/scripted.mp4`;
    const [lookedCenter, recordedCenter] = [boxCenter(looked, 150, 640) ?? -1, boxCenter(recorded, 150, 640, 1) ?? -2];
    expect(Math.abs(lookedCenter - recordedCenter)).toBeLessThanOrEqual(3);
    expect(lookedCenter).toBeGreaterThan(300);
    expect(lookedCenter).toBeLessThan(360);
    expect(Math.abs(brightness(looked, Math.round(lookedCenter), 150) - 192)).toBeLessThanOrEqual(20);
    expect(Math.abs(brightness(recorded, Math.round(recordedCenter), 150, 1) - 192)).toBeLessThanOrEqual(20);
  });

  it('M5.15-H4 a three.js scene turns on the clock, the same at every call', async () => {
    const { kernel, write, stored } = await world();
    write('v/turning.html', turning);
    const frames = async (): Promise<string[]> => (await kernel.exec('kvvideo.frame.capture', { page: 'v/turning.html', atMs: [0, 1000], width: 640, height: 360 })).images.map((image) => frameHashes(stored(image.fileId))[0] ?? '');
    const first = await frames();
    expect(await frames()).toEqual(first);
    expect(first[0]).not.toBe(first[1]);
  });

  it('M5.15-H5 M5.15-E4 a sound cue at its element start, once, and an unknown sound ignored', async () => {
    const { kernel, write, workspace } = await world();
    write('v/cued.html', cued);
    const answer = await kernel.exec('kvvideo.clip.record', { page: 'v/cued.html', file: 'v/cued.mp4', width: 640, height: 360 });
    expect(answer.sounds).toEqual([{ sound: 'click', atMs: 0 }, { sound: 'pop', atMs: 1200 }]);
    expect(JSON.parse(readFileSync(`${workspace}/v/cued.mp4.kvvideo.json`, 'utf8')).sounds).toEqual(answer.sounds);
  });

  it("M5.15-E3 timers keep their order, intervals repeat, cleared ones don't run, and a failing callback doesn't stop the rest", async () => {
    const { kernel, write, stored } = await world();
    write('v/timers.html', timers);
    const look = await kernel.exec('kvvideo.frame.capture', { page: 'v/timers.html', atMs: [1000], width: 640, height: 360 });
    const file = stored(look.images[0]?.fileId ?? '');
    expect(boxCenter(file, 20, 640)).toBe(49.5);
    expect(boxCenter(file, 120, 640)).toBeUndefined();
    expect(boxCenter(file, 220, 640)).toBeDefined();
  });

  it('M5.15-E1 a page with a click is recorded in real time', async () => {
    const { kernel, write, workspace } = await world();
    write('v/button.html', '<!doctype html><html><body><button id="go">Go</button></body></html>');
    const answer = await kernel.exec('kvvideo.clip.record', { page: 'v/button.html', file: 'v/button.mp4', width: 640, height: 360, steps: [{ do: 'click', target: '#go' }] });
    expect(answer.sounds).toEqual([]);
    expect(probe(`${workspace}/v/button.mp4`, 'r_frame_rate')).toBe('30/1');
    expect(JSON.parse(readFileSync(`${workspace}/v/button.mp4.kvvideo.json`, 'utf8')).drawn).toBe(false);
  });
});
