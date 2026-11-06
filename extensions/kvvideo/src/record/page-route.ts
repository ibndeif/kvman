import { existsSync, realpathSync, statSync } from 'node:fs';
import path from 'node:path';
import { answerSceneAddress, type AddressAnswer, type SceneAssets } from './scene-address.ts';

// An HTML page of the workspace, recorded without a server (plan 16 §16.5; ADR 0115, 32): it is opened on an origin
// that never resolves, and each request to that origin is answered with the file at its path under the page's folder.
// A path that leaves the folder, through `..` or a symlink, or a file that doesn't exist, is answered 404. The
// `kvvideo/` address is kvvideo's, never the folder's (ADR 0120, 7).

export const pageOrigin = 'http://page.kvvideo.invalid';

const contentTypes: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.htm': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json',
  '.txt': 'text/plain; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.otf': 'font/otf',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.ogg': 'audio/ogg',
};

export type PageAnswer = AddressAnswer;

/** The address a page file is opened at. */
export function pageAddress(page: string): string {
  return `${pageOrigin}/${encodeURIComponent(path.basename(page))}`;
}

function inside(folder: string, candidate: string): boolean {
  const relative = path.relative(folder, candidate);
  return relative !== '' && !relative.startsWith('..') && !path.isAbsolute(relative);
}

function decodedPath(address: string): string | undefined {
  const { pathname } = new URL(address);
  try {
    return decodeURIComponent(pathname).replace(/^\/+/, '');
  } catch (error) {
    if (error instanceof URIError) return undefined;
    throw error;
  }
}

/** What a request of the page's origin is answered with, from the page's folder. */
export function answerPageRequest(folder: string, address: string, assets: SceneAssets): PageAnswer {
  const relative = decodedPath(address);
  if (relative === undefined) return { status: 404 };
  if (relative.startsWith('kvvideo/')) return answerSceneAddress(assets, relative.slice('kvvideo/'.length));
  const file = path.resolve(folder, relative);
  if (!inside(folder, file) || !existsSync(file)) return { status: 404 };
  if (!inside(realpathSync(folder), realpathSync(file)) || !statSync(file).isFile()) return { status: 404 };
  return { status: 200, file, contentType: contentTypes[path.extname(file).toLowerCase()] ?? 'application/octet-stream' };
}
