import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { useKvwebuiKernel } from './support/kvwebui-kernel.ts';

const kvwebui = useKvwebuiKernel();

// The first bytes of each type, then filler, as a file of that type starts.
const files = {
  'photo.png': Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]),
  'photo.jpg': Buffer.from([0xff, 0xd8, 0xff, 0xe0, 4, 5]),
  'anim.gif': Buffer.from('GIF89a-gif-body'),
  'shots/screen.webp': Buffer.concat([Buffer.from('RIFF'), Buffer.from([0, 0, 0, 0]), Buffer.from('WEBPVP8 ')]),
};
const failed = (code: string) => expect.objectContaining({ problem: expect.objectContaining({ code }) });

async function started() {
  const kernel = await kvwebui.start([]);
  const folder = kernel.homeFolder;
  mkdirSync(path.join(folder, 'shots'), { recursive: true });
  for (const [name, bytes] of Object.entries(files)) writeFileSync(path.join(folder, name), bytes);
  const read = (file: string) => kernel.exec('kvwebui.image.get', { path: file });
  return { kernel, folder, read };
}

describe('kvwebui.image.get (06 §6.8, ADR 0124, 19)', () => {
  it('M5.20-H1 a workspace PNG, JPEG, GIF, or WebP answers its type and its content as base64', async () => {
    const { kernel, folder, read } = await started();
    const types = { 'photo.png': 'image/png', 'photo.jpg': 'image/jpeg', 'anim.gif': 'image/gif', 'shots/screen.webp': 'image/webp' };
    for (const [name, type] of Object.entries(types)) expect(await read(name), name).toEqual({ type, data: files[name as keyof typeof files].toString('base64') });
    expect(await read(path.join(folder, 'photo.png'))).toEqual({ type: 'image/png', data: files['photo.png'].toString('base64') });
    const info = (await kernel.exec('kernel.extensions.list', {})).find((extension) => extension.name === '@kvman/kvwebui');
    expect(info?.queries.find((query) => query.name === 'kvwebui.image.get')?.public).toBe(true);
  });

  it('M5.20-E1 a path that leaves the workspace, by .., by an absolute path, or by a link, is refused', async () => {
    const { folder, read } = await started();
    const outside = mkdtempSync(path.join(tmpdir(), 'kvwebui-outside-'));
    writeFileSync(path.join(outside, 'outside.png'), files['photo.png']);
    writeFileSync(path.join(folder, '..', 'beside.png'), files['photo.png']);
    symlinkSync(path.join(outside, 'outside.png'), path.join(folder, 'link.png'));
    try {
      for (const file of ['../beside.png', path.join(outside, 'outside.png'), 'link.png']) await expect(read(file), file).rejects.toEqual(failed('VALIDATION_FAILED'));
    } finally {
      rmSync(outside, { recursive: true, force: true });
    }
  });

  it('M5.20-E2 an SVG, whatever its name, a text file, and a folder are refused', async () => {
    const { folder, read } = await started();
    const svg = '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>';
    writeFileSync(path.join(folder, 'logo.svg'), svg);
    writeFileSync(path.join(folder, 'logo.png'), svg);
    writeFileSync(path.join(folder, 'notes.txt'), 'notes');
    for (const file of ['logo.svg', 'logo.png', 'notes.txt', 'shots']) await expect(read(file), file).rejects.toEqual(failed('VALIDATION_FAILED'));
  });

  it('M5.20-E3 a missing image is NOT_FOUND, and one over 5 MiB is TOO_LARGE with its limit', async () => {
    const { folder, read } = await started();
    await expect(read('missing.png')).rejects.toEqual(failed('NOT_FOUND'));
    writeFileSync(path.join(folder, 'huge.png'), Buffer.concat([files['photo.png'], Buffer.alloc(5 * 1024 * 1024 + 1 - files['photo.png'].length)]));
    await expect(read('huge.png')).rejects.toEqual(expect.objectContaining({ problem: expect.objectContaining({ code: 'TOO_LARGE', params: { limit: 5 * 1024 * 1024 } }) }));
  });
});
