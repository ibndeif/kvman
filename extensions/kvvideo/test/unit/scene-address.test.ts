import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { fontsFolder } from '../../src/fonts/bundled-fonts.ts';
import { failedLoads } from '../../src/record/failed-loads.ts';
import { answerPageRequest, pageOrigin } from '../../src/record/page-route.ts';
import { answerSceneAddress, brandCssOf, sceneAssetsOf } from '../../src/record/scene-address.ts';

const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

function workspace(): string {
  const root = mkdtempSync(path.join(tmpdir(), 'kvvideo-address-'));
  roots.push(root);
  mkdirSync(path.join(root, 'brand'));
  writeFileSync(path.join(root, 'brand', 'logo.png'), 'png');
  writeFileSync(path.join(root, 'brand', 'logo.svg'), '<svg/>');
  copyFileSync(path.join(fontsFolder, 'Lato-Bold.ttf'), path.join(root, 'brand', 'Brand-Bold.ttf'));
  return root;
}

const colors = { primary: '#047857', background: '#F8FAFC', text: '#0F172A' };
const fileOf = (answer: ReturnType<typeof answerSceneAddress>): string => ('file' in answer ? answer.file : '');

describe("kvvideo's address in a page (16 §16.5, ADR 0120, 7, 18, and 19)", () => {
  it("M5.14-H1 brand.css gives the brand's colours and font, and every bundled font", () => {
    const css = brandCssOf({ logo: 'brand/logo.png', colors, font: 'Amiri' }, undefined, undefined);
    expect(css).toContain(":root { --brand-primary: #047857; --brand-background: #F8FAFC; --brand-text: #0F172A; --brand-font: 'Amiri', sans-serif; }");
    for (const file of ['Amiri-Bold.ttf', 'IBMPlexSansArabic-Bold.ttf', 'Lato-Bold.ttf', 'Poppins-Bold.ttf']) expect(css).toContain(`src: url('fonts/${file}')`);
    expect(css).not.toContain(':lang(ar)');
  });

  it('M5.14-H2 a brand font file of the workspace is declared by its family and served', () => {
    const root = workspace();
    const assets = sceneAssetsOf(root, { logo: null, colors, font: 'brand/Brand-Bold.ttf' });
    expect(assets.brandCss).toContain("@font-face { font-family: 'Lato'; src: url('fonts/brand.ttf');");
    expect(assets.brandCss).toContain("--brand-font: 'Lato', sans-serif;");
    expect(answerSceneAddress(assets, 'fonts/brand.ttf')).toEqual({ status: 200, file: path.join(root, 'brand', 'Brand-Bold.ttf'), contentType: 'font/ttf' });
  });

  it("M5.14-H3 with no brand, the defaults, by the page's language", () => {
    const css = brandCssOf(null, undefined, undefined);
    expect(css).toContain(":root { --brand-primary: #2563EB; --brand-background: #0F172A; --brand-text: #F8FAFC; --brand-font: 'Poppins', sans-serif; }");
    expect(css).toContain(":root:lang(ar) { --brand-font: 'IBM Plex Sans Arabic', sans-serif; }");
  });

  it('M5.14-H4 the kit, the brand, the logo, the fonts, and the libraries are answered', () => {
    const root = workspace();
    const assets = sceneAssetsOf(root, { logo: 'brand/logo.png', colors, font: null });
    expect(answerSceneAddress(assets, 'motion.css')).toMatchObject({ status: 200, contentType: 'text/css; charset=utf-8' });
    expect(readFileSync(fileOf(answerSceneAddress(assets, 'motion.css')), 'utf8')).toContain('.kv-rise');
    expect(answerSceneAddress(assets, 'brand.css')).toEqual({ status: 200, body: assets.brandCss, contentType: 'text/css; charset=utf-8' });
    expect(answerSceneAddress(assets, 'logo.png')).toEqual({ status: 200, file: path.join(root, 'brand', 'logo.png'), contentType: 'image/png' });
    expect(answerSceneAddress(assets, 'fonts/Amiri-Bold.ttf')).toEqual({ status: 200, file: path.join(fontsFolder, 'Amiri-Bold.ttf'), contentType: 'font/ttf' });
    for (const library of ['lib/three/build/three.module.js', 'lib/three/build/three.core.js', 'lib/three/examples/jsm/geometries/RoundedBoxGeometry.js', 'lib/anime.js', 'lib/lottie.js']) {
      const answer = answerSceneAddress(assets, library);
      expect(answer, library).toMatchObject({ status: 200, contentType: 'text/javascript; charset=utf-8' });
      expect(readFileSync(fileOf(answer), 'utf8').length, library).toBeGreaterThan(1000);
    }
  });

  it("M5.14-E1 the address is kvvideo's, never the page folder's", () => {
    const root = workspace();
    const folder = path.join(root, 'videos');
    mkdirSync(path.join(folder, 'kvvideo'), { recursive: true });
    writeFileSync(path.join(folder, 'kvvideo', 'motion.css'), '.mine {}');
    const answer = answerPageRequest(folder, `${pageOrigin}/kvvideo/motion.css`, sceneAssetsOf(root, null));
    expect(fileOf(answer)).not.toBe(path.join(folder, 'kvvideo', 'motion.css'));
    expect(readFileSync(fileOf(answer), 'utf8')).toContain('.kv-rise');
  });

  it('M5.14-E2 anything else under the address is 404', () => {
    const root = workspace();
    const plain = sceneAssetsOf(root, null);
    const svg = sceneAssetsOf(root, { logo: 'brand/logo.svg', colors, font: null });
    expect(answerSceneAddress(svg, 'logo.svg')).toMatchObject({ status: 200, contentType: 'image/svg+xml' });
    for (const [assets, relative] of [
      [plain, 'logo.png'],
      [svg, 'logo.png'],
      [plain, 'other.css'],
      [plain, 'fonts/missing.ttf'],
      [plain, 'fonts/brand.ttf'],
      [plain, 'fonts/../../package.json'],
      [plain, 'lib/three/src/Three.js'],
      [plain, 'lib/three/package.json'],
      [plain, 'lib/three/build/../../package.json'],
      [plain, 'lib/three/build'],
    ] as const) {
      expect(answerSceneAddress(assets, relative), relative).toEqual({ status: 404 });
    }
    expect(sceneAssetsOf(root, { logo: 'brand/gone.png', colors, font: 'brand/gone.ttf' })).toMatchObject({ logo: undefined, brandFont: undefined });
  });

  it("M5.14-E3 failed loads are listed once each, at most 20, without kvman's own port", () => {
    const loads = failedLoads(3737);
    loads.add('http://page.kvvideo.invalid/a.css', 404);
    loads.add('http://page.kvvideo.invalid/a.css', 404);
    loads.add('http://127.0.0.1:3737/api/health', 0);
    for (let index = 0; index < 25; index += 1) loads.add(`http://page.kvvideo.invalid/missing-${String(index)}.png`, 404);
    const listed = loads.list();
    expect(listed).toHaveLength(20);
    expect(listed[0]).toEqual({ url: 'http://page.kvvideo.invalid/a.css', status: 404 });
    expect(listed.filter((load) => load.url.includes('3737'))).toEqual([]);
  });
});
