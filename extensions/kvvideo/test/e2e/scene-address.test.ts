import { execFileSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';
import { useKvvideo } from '../support/kvvideo-kernel.ts';
import { useTestPages } from '../support/test-page.ts';

// kvvideo's address in a page (plan 16 §16.5; ADR 0120, 6, 7, and 20) with the installed Chrome: the brand's colours,
// logo, and font, three.js with an addon, anime.js, and lottie-web, and the files a page or a website fails to load.

const kvvideo = useKvvideo();
const pages = useTestPages();

function pixel(file: string, x: number, y: number): number[] {
  return [...execFileSync('ffmpeg', ['-v', 'error', '-i', file, '-frames:v', '1', '-vf', `format=rgb24,crop=1:1:${String(x)}:${String(y)}`, '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-'])];
}

const near = (rgb: number[], wanted: number[]): boolean => rgb.every((value, index) => Math.abs(value - (wanted[index] ?? 0)) <= 40);

const brand = { logo: 'brand/logo.png', colors: { primary: '#047857', background: '#00FF00', text: '#0F172A' }, font: 'Amiri' };

const branded = `<!doctype html><html lang="en"><head><link rel="stylesheet" href="kvvideo/brand.css"><style>
body { margin: 0; background: var(--brand-background); font-family: var(--brand-font); }
#logo { position: absolute; left: 20px; top: 20px; width: 100px; height: 100px; }
#font { position: absolute; left: 200px; top: 20px; width: 100px; height: 100px; background: #000; }
</style></head><body><img id="logo" src="kvvideo/logo.png" alt=""><div id="font"></div>
<script>document.fonts.load("20px 'Amiri'").then(() => { if (document.fonts.check("20px 'Amiri'")) document.getElementById('font').style.background = '#0000ff'; });</script>
</body></html>`;

const libraries = `<!doctype html><html><head><style>body { margin: 0; background: #000; } #libs { position: absolute; left: 10px; top: 10px; width: 60px; height: 60px; background: #888; }</style>
<script type="importmap">{ "imports": { "three": "./kvvideo/lib/three/build/three.module.js", "three/addons/": "./kvvideo/lib/three/examples/jsm/" } }</script>
<script src="kvvideo/lib/lottie.js"></script></head><body><div id="libs"></div>
<script type="module">
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { animate } from './kvvideo/lib/anime.js';
const renderer = new THREE.WebGLRenderer();
renderer.setSize(innerWidth, innerHeight);
document.body.appendChild(renderer.domElement);
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(50, innerWidth / innerHeight, 0.1, 100);
camera.position.z = 4;
scene.add(new THREE.Mesh(new RoundedBoxGeometry(1.5, 1.5, 1.5, 2, 0.1), new THREE.MeshBasicMaterial({ color: '#ff0000' })));
renderer.render(scene, camera);
const loaded = typeof animate === 'function' && typeof window.lottie?.loadAnimation === 'function';
document.getElementById('libs').style.background = loaded ? '#0000ff' : '#ffff00';
</script></body></html>`;

const outsideFont = `<!doctype html><html><head><style>
@font-face { font-family: Outside; src: url('../outside/font.woff2'); }
body { font-family: Outside; }
</style></head><body><p>Text</p></body></html>`;

async function world() {
  const started = await kvvideo.start({ settings: { 'kvvideo.browser': 'chrome', 'kvvideo.brand': brand } });
  const logo = started.write('brand/logo.png', '');
  execFileSync('ffmpeg', ['-v', 'error', '-f', 'lavfi', '-i', 'color=c=red:s=16x16', '-frames:v', '1', '-update', '1', '-y', logo]);
  return { ...started, stored: (fileId: string): string => `${started.kernel.home}/files/${fileId}` };
}

describe("kvvideo's address in a page (16 §16.5, ADR 0120)", () => {
  it("M5.14-H5 a page is drawn in the brand's font and colours, with its logo", async () => {
    const { kernel, write, stored } = await world();
    write('v/branded.html', branded);
    const answer = await kernel.exec('kvvideo.frame.capture', { page: 'v/branded.html', width: 640, height: 360 });
    const file = stored(answer.images[0]?.fileId ?? '');
    expect(near(pixel(file, 400, 300), [0, 255, 0])).toBe(true);
    expect(near(pixel(file, 70, 70), [255, 0, 0])).toBe(true);
    expect(near(pixel(file, 250, 70), [0, 0, 255])).toBe(true);
    expect(answer.failed).toEqual([]);
  });

  it('M5.14-H6 three.js and an addon, anime.js, and lottie-web load', async () => {
    const { kernel, write, stored } = await world();
    write('v/libraries.html', libraries);
    const answer = await kernel.exec('kvvideo.frame.capture', { page: 'v/libraries.html', width: 640, height: 360 });
    const file = stored(answer.images[0]?.fileId ?? '');
    expect(near(pixel(file, 320, 180), [255, 0, 0])).toBe(true);
    expect(near(pixel(file, 40, 40), [0, 0, 255])).toBe(true);
    expect(answer.failed).toEqual([]);
  });

  it("M5.14-H7 a file the page can't load is reported by look and record", async () => {
    const { kernel, write } = await world();
    write('v/outside.html', outsideFont);
    const failed = [{ url: 'http://page.kvvideo.invalid/outside/font.woff2', status: 404 }];
    expect((await kernel.exec('kvvideo.frame.capture', { page: 'v/outside.html', width: 640, height: 360 })).failed).toEqual(failed);
    expect((await kernel.exec('kvvideo.clip.record', { page: 'v/outside.html', file: 'v/outside.mp4', width: 640, height: 360, steps: [{ do: 'wait', ms: 300 }] })).failed).toEqual(failed);
  });

  it("M5.14-E4 a website's request that fails is listed with status 0", async () => {
    const { kernel } = await world();
    const closed = await pages.closedPort();
    const site = await pages.page(`<!doctype html><html><body><img src="http://127.0.0.1:${String(closed)}/gone.png" alt=""></body></html>`);
    const answer = await kernel.exec('kvvideo.frame.capture', { url: site.url, width: 640, height: 360 });
    expect(answer.failed).toEqual([{ url: `http://127.0.0.1:${String(closed)}/gone.png`, status: 0 }]);
  });
});
