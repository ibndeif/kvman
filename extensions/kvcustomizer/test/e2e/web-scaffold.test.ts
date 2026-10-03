import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { chromium, type Browser } from 'playwright';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { z } from '@kvman/sdk';
import { childWait, kvmanWorld, until, type KvmanWorld } from '../support/kvman-child.ts';
import { npmEnvironment } from '../support/npm-environment.ts';
import { kvcustomizerProcesses } from '../support/preview-world.ts';

let browser: Browser;
let world: KvmanWorld;
beforeAll(async () => {
  browser = await chromium.launch();
  world = kvmanWorld();
});
afterAll(async () => {
  await world.close();
  await browser.close();
});

describe('the web scaffold (09 §9.2–9.3, 06 §6.4)', () => {
  it('M2.5-H2 a web scaffold builds, its page shows the component in the preview, and a component edit shows after a refresh', async () => {
    const kvman = await world.start(['--preset', 'dev'], npmEnvironment());
    await kvman.call('commands', 'kvcustomizer.ext.new', { name: 'cards', namespace: 'cards', folder: 'cards', web: true });
    const folder = path.join(world.project, 'cards');
    execFileSync('npm', ['run', 'web:build'], { cwd: folder, env: { ...process.env, ...npmEnvironment() }, stdio: 'pipe' });
    const built = path.join(folder, 'dist', 'web', 'components', 'hello.js');
    expect(existsSync(built)).toBe(true);
    expect(existsSync(path.join(folder, 'dist', 'web', 'components', 'hello.css'))).toBe(true);
    const url = z.object({ url: z.string() }).parse(await kvman.call('commands', 'kvcustomizer.preview.start', { extensions: ['cards'] })).url;
    expect((await kvcustomizerProcesses(kvman)).map((process) => process.name).sort()).toEqual(['preview', 'web-1']);

    const page = await browser.newPage();
    await page.goto(`${url}cards/hello`);
    await page.getByText('Hello from cards!').waitFor({ timeout: childWait.timeout });
    await page.getByText('Hello from a Vue component!').waitFor({ timeout: childWait.timeout });
    const component = path.join(folder, 'web', 'components', 'Hello.vue');
    writeFileSync(component, readFileSync(component, 'utf8').replace('<p class="hello-text">', '<p class="hello-text">Edited. '));
    await until(async () => readFileSync(built, 'utf8').includes('Edited. '), z.boolean(), (rebuilt) => rebuilt);
    await page.reload();
    await page.getByText('Edited. Hello from a Vue component!').waitFor({ timeout: childWait.timeout });

    await kvman.call('commands', 'kvcustomizer.preview.stop', {});
    expect(await kvcustomizerProcesses(kvman)).toEqual([]);
  });
});
