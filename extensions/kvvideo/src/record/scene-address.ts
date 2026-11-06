import { existsSync, statSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { logoExtensions, type Brand } from '../brand/brand.ts';
import { captionFont } from '../compose/caption-font.ts';
import { bundledFonts, fontsFolder } from '../fonts/bundled-fonts.ts';
import { inputPath } from '../files/workspace-paths.ts';

// kvvideo's address in a page (plan 16 §16.5; ADR 0120, 6, 7, 18, and 19): `kvvideo/` under a page's origin is
// kvvideo's, never the page folder's. It answers the motion kit, the brand as CSS, the brand's logo and font file, the
// bundled fonts, and three.js (its `build/` and `examples/jsm/` folders), anime.js, and lottie-web; anything else 404.

export type AddressAnswer = { status: 200; file: string; contentType: string } | { status: 200; body: string; contentType: string } | { status: 404 };

/** What a page's `kvvideo/` address serves for one workspace: its brand as CSS, and the brand's files. */
export type SceneAssets = { brandCss: string; logo: string | undefined; brandFont: string | undefined };

const kitFolder = fileURLToPath(new URL('../../kit/', import.meta.url));
const require = createRequire(import.meta.url);

// The libraries' files, from what each pinned package exports (ADR 0120, 30): three's `build/` and `examples/jsm/`
// folders, anime.js's ES module bundle, and lottie-web's player.
const threeBuild = path.dirname(require.resolve('three'));
const threeRoot = path.dirname(threeBuild);
const threeFolders = [threeBuild, path.dirname(require.resolve('three/examples/jsm/Addons.js'))];
const animeFile = path.join(path.dirname(require.resolve('animejs')), '..', 'bundles', 'anime.esm.min.js');
const lottieFile = path.join(path.dirname(require.resolve('lottie-web')), 'lottie.min.js');

const types: Record<string, string> = {
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ttf': 'font/ttf',
  '.otf': 'font/otf',
};

const typeOf = (file: string): string => types[path.extname(file).toLowerCase()] ?? 'application/octet-stream';
const cssType = 'text/css; charset=utf-8';
const served = (file: string): AddressAnswer => ({ status: 200, file, contentType: typeOf(file) });
const missing: AddressAnswer = { status: 404 };

const inside = (folder: string, file: string): boolean => {
  const relative = path.relative(folder, file);
  return relative !== '' && !relative.startsWith('..') && !path.isAbsolute(relative);
};

const fontFace = (family: string, address: string): string => `@font-face { font-family: '${family}'; src: url('${address}'); font-weight: 100 900; font-display: block; }`;

/** The brand as CSS: its colours and font as variables, the bundled fonts, and a brand font file, by family. */
export function brandCssOf(brand: Brand | null, brandFontFamily: string | undefined, brandFontExtension: string | undefined): string {
  const colours = brand?.colors ?? { primary: '#2563EB', background: '#0F172A', text: '#F8FAFC' };
  const faces = bundledFonts.map((font) => fontFace(font.name, `fonts/${font.file}`));
  if (brandFontFamily !== undefined && brandFontExtension !== undefined) faces.push(fontFace(brandFontFamily, `fonts/brand${brandFontExtension}`));
  const named = brand?.font === null || brand?.font === undefined ? undefined : (brandFontFamily ?? brand.font);
  const font = (family: string): string => `'${family}', sans-serif`;
  return [
    ...faces,
    `:root { --brand-primary: ${colours.primary}; --brand-background: ${colours.background}; --brand-text: ${colours.text}; --brand-font: ${font(named ?? 'Poppins')}; }`,
    ...(named === undefined ? [`:root:lang(ar) { --brand-font: ${font('IBM Plex Sans Arabic')}; }`] : []),
    '',
  ].join('\n');
}

// A brand's file that is still in the workspace; one removed since the brand was set is left out, and its load fails.
const present = (root: string, file: string | null | undefined): file is string => file !== null && file !== undefined && existsSync(path.resolve(root, file));

/** What the workspace at `root` serves at its pages' `kvvideo/` address. */
export function sceneAssetsOf(root: string, brand: Brand | null): SceneAssets {
  const logo = present(root, brand?.logo) ? inputPath(root, brand.logo, logoExtensions) : undefined;
  const fontFile = brand?.font !== null && brand?.font !== undefined && /\.(ttf|otf)$/iu.test(brand.font) ? brand.font : undefined;
  const font = present(root, fontFile) ? captionFont(root, fontFile, []) : undefined;
  const extension = font === undefined ? undefined : path.extname(font.file).toLowerCase();
  return { brandCss: brandCssOf(brand, font?.family, extension), logo, brandFont: font?.file };
}

function fontAnswer(assets: SceneAssets, name: string): AddressAnswer {
  const brandFont = assets.brandFont;
  if (brandFont !== undefined && name === `brand${path.extname(brandFont).toLowerCase()}`) return served(brandFont);
  const bundled = bundledFonts.find((font) => font.file === name);
  return bundled === undefined ? missing : served(path.join(fontsFolder, bundled.file));
}

function threeAnswer(relative: string): AddressAnswer {
  const file = path.resolve(threeRoot, relative);
  const folder = threeFolders.find((candidate) => inside(candidate, file));
  return folder !== undefined && existsSync(file) && statSync(file).isFile() ? served(file) : missing;
}

/** The answer to `kvvideo/<relative>` under a page's origin. */
export function answerSceneAddress(assets: SceneAssets, relative: string): AddressAnswer {
  if (relative === 'motion.css') return served(path.join(kitFolder, 'motion.css'));
  if (relative === 'brand.css') return { status: 200, body: assets.brandCss, contentType: cssType };
  if (relative === 'lib/anime.js') return served(animeFile);
  if (relative === 'lib/lottie.js') return served(lottieFile);
  if (relative.startsWith('lib/three/')) return threeAnswer(relative.slice('lib/three/'.length));
  if (relative.startsWith('fonts/')) return fontAnswer(assets, relative.slice('fonts/'.length));
  const logo = assets.logo;
  if (logo !== undefined && relative === `logo${path.extname(logo).toLowerCase()}`) return served(logo);
  return missing;
}
