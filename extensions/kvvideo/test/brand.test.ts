import { describe, expect, it } from 'vitest';
import { ProblemError } from '@kvman/sdk';
import { useKvvideo } from './support/kvvideo-kernel.ts';

const kvvideo = useKvvideo();

const problemOf = (run: Promise<unknown>): Promise<unknown> =>
  run.then(
    () => undefined,
    (error: unknown) => (error instanceof ProblemError ? error.problem : error),
  );

const colors = { primary: '#2563EB', background: '#0F172A', text: '#F8FAFC' };

describe("the workspace's brand (16 §16.2 and §16.4, ADR 0115, 21, 43, and 61)", { timeout: 60_000 }, () => {
  it('M5.7-H12 brand-set saves it in the workspace, and brand reads it', async () => {
    const { kernel, write } = await kvvideo.start();
    write('brand/logo.png', 'png');
    expect(await kernel.exec('kvvideo.brand.get', {})).toBeNull();
    const brand = { logo: 'brand/logo.png', colors, font: 'Lato' };
    expect(await kernel.exec('kvvideo.brand.set', brand)).toEqual({});
    expect(await kernel.exec('kvvideo.brand.get', {})).toEqual(brand);
    const setting = (await kernel.exec('kernel.settings.list', {})).find((entry) => entry.key === 'kvvideo.brand');
    expect([setting?.value, setting?.source]).toEqual([brand, 'workspace']);
    const video = (await kernel.exec('kvcoder.connector.list', {})).find((connector) => connector.name === 'video');
    expect(video?.commands?.filter((command) => command.name.startsWith('brand')).map(({ name, command, query }) => ({ name, command, query }))).toEqual([
      { name: 'brand', command: 'kvvideo.brand.get', query: true },
      { name: 'brand-set', command: 'kvvideo.brand.set', query: false },
    ]);
  });

  it('M5.7-E5 a logo outside the workspace or of another kind, a missing logo, a wrong colour, and an unknown font fail', async () => {
    const { kernel, write } = await kvvideo.start();
    write('brand/logo.gif', 'gif');
    const attempts = [
      { logo: '../logo.png', colors, font: null },
      { logo: 'brand/logo.gif', colors, font: null },
      { logo: 'brand/missing.png', colors, font: null },
      { logo: null, colors: { ...colors, primary: 'blue' }, font: null },
      { logo: null, colors, font: 'Comic Sans' },
    ];
    const codes = [];
    for (const attempt of attempts) codes.push(((await problemOf(kernel.exec('kvvideo.brand.set', attempt))) as { code: string }).code);
    expect(codes).toEqual(['VALIDATION_FAILED', 'VALIDATION_FAILED', 'NOT_FOUND', 'VALIDATION_FAILED', 'VALIDATION_FAILED']);
    expect(await kernel.exec('kvvideo.brand.get', {})).toBeNull();
  });
});
