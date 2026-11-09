import { open, realpath, stat } from 'node:fs/promises';
import path from 'node:path';
import { ProblemError, z, type Ctx } from '@kvman/sdk';

// `kvwebui.image.get` (plan 06 §6.8, ADR 0124, 19): a workspace image for OpenUI, which loads nothing from the
// network. Its type comes from its first bytes, never its name, so an SVG, which can hold scripts, is never read.

const imageLimit = 5 * 1024 * 1024;

const imageTypes = ['image/png', 'image/jpeg', 'image/gif', 'image/webp'] as const;

type ImageType = (typeof imageTypes)[number];

const startsWith = (bytes: Uint8Array, signature: readonly number[], at = 0): boolean => signature.every((byte, index) => bytes[at + index] === byte);
const ascii = (text: string): number[] => [...text].map((character) => character.charCodeAt(0));

function imageType(bytes: Uint8Array): ImageType | undefined {
  if (startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return 'image/png';
  if (startsWith(bytes, [0xff, 0xd8, 0xff])) return 'image/jpeg';
  if (startsWith(bytes, ascii('GIF87a')) || startsWith(bytes, ascii('GIF89a'))) return 'image/gif';
  if (startsWith(bytes, ascii('RIFF')) && startsWith(bytes, ascii('WEBP'), 8)) return 'image/webp';
  return undefined;
}

const invalid = (message: string): ProblemError => new ProblemError({ code: 'VALIDATION_FAILED', message });

// The file's real path, through every link, when it is inside the workspace's real folder.
async function insideWorkspace(root: string, requested: string): Promise<string> {
  const folder = await realpath(root);
  let file: string;
  try {
    file = await realpath(path.resolve(folder, requested));
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') throw new ProblemError({ code: 'NOT_FOUND', message: `There is no file ${requested} in the workspace.` });
    throw error;
  }
  const relative = path.relative(folder, file);
  if (relative === '' || relative.startsWith('..') || path.isAbsolute(relative)) throw invalid(`${requested} isn't a file inside the workspace.`);
  return file;
}

async function readImage(root: string, requested: string): Promise<{ type: ImageType; data: string }> {
  const file = await insideWorkspace(root, requested);
  const info = await stat(file);
  if (!info.isFile()) throw invalid(`${requested} isn't a file.`);
  if (info.size > imageLimit) throw new ProblemError({ code: 'TOO_LARGE', message: `${requested} is larger than 5 MiB.`, params: { limit: imageLimit } });
  const handle = await open(file);
  try {
    const bytes = await handle.readFile();
    const type = imageType(bytes);
    if (type === undefined) throw invalid(`${requested} isn't a PNG, JPEG, GIF, or WebP image.`);
    return { type, data: bytes.toString('base64') };
  } finally {
    await handle.close();
  }
}

export function registerWorkspaceImage(ctx: Ctx): void {
  ctx.registerQuery('kvwebui.image.get', {
    description: "Gives a PNG, JPEG, GIF, or WebP image of the workspace, up to 5 MiB, as base64, for OpenUI's images.",
    public: true,
    input: z.object({ path: z.string().min(1).describe('The image, relative to the workspace or absolute inside it.') }),
    output: z.object({ type: z.enum(imageTypes), data: z.string() }),
    handle: ({ path: requested }) => readImage(ctx.job.workspace.path, requested),
  });
}
