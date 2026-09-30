import { createReadStream, existsSync, realpathSync, statSync } from 'node:fs';
import path from 'node:path';
import { Readable } from 'node:stream';
import { getMimeType } from 'hono/utils/mime';

// Files of an extension's `kvman.web` folder (plan 04 §4.1): a path that leaves the folder, through `..` or a symbolic
// link, or a missing file, is no file.

function within(folder: string, file: string): boolean {
  return file.startsWith(folder + path.sep);
}

function decodedPath(requestPath: string): string | undefined {
  try {
    return decodeURIComponent(requestPath);
  } catch {
    return undefined;
  }
}

// The absolute path of the file a request path names in the folder, or undefined when there is no such file there.
export function fileWithin(folder: string, requestPath: string): string | undefined {
  const decoded = decodedPath(requestPath);
  if (decoded === undefined || decoded.includes('\0') || !existsSync(folder)) return undefined;
  const root = realpathSync(folder);
  const candidate = path.join(root, decoded);
  if (!within(root, candidate) || !existsSync(candidate)) return undefined;
  const real = realpathSync(candidate);
  return within(root, real) && statSync(real).isFile() ? real : undefined;
}

export function staticResponse(file: string): Response {
  const body = Readable.toWeb(createReadStream(file));
  const headers = { 'Content-Type': getMimeType(file) ?? 'application/octet-stream', 'Content-Length': String(statSync(file).size) };
  return new Response(body, { headers });
}
