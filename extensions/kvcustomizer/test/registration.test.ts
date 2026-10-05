import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { z } from '@kvman/sdk';
import { useKvcustomizer } from './support/kvcustomizer-kernel.ts';

const kvcustomizer = useKvcustomizer();

const expected = [
  { name: 'docs', commands: ['list', 'get'] },
  { name: 'ext', commands: ['new', 'list', 'check', 'test'] },
  { name: 'kvman', commands: ['model-list', 'model-set', 'settings-list', 'settings-set', 'settings-reset', 'extensions-list', 'extensions-install', 'extensions-uninstall', 'preset-get'] },
  { name: 'preset', commands: ['new', 'check'] },
  { name: 'preview', commands: ['start', 'stop', 'status'] },
];

describe("kvcustomizer's connectors and section (09 §9.1, §9.4)", { timeout: 30_000 }, () => {
  it('M2.5-E35 kvcoder lists the four connectors and every workspace prompt has the guide section, again after a restart', async () => {
    const world = await kvcustomizer.start();
    const second = await world.kernel.exec('kernel.workspace.open', { path: world.write('second/.keep', '').replace(/[/\\]\.keep$/, '') });
    for (let round = 0; round < 2; round += 1) {
      await world.kernel.clock.advance(0);
      const connectors = (await world.kernel.exec('kvcoder.connector.list', {})).filter((connector) => connector.owner === '@kvman/kvcustomizer');
      expect(connectors.map((connector) => ({ name: connector.name, commands: connector.commands?.map((command) => command.name) })).sort((a, b) => a.name.localeCompare(b.name))).toEqual(expected);
      for (const workspaceId of [undefined, second.id]) {
        const options = workspaceId === undefined ? {} : { workspaceId };
        const session = await world.kernel.exec('kvcoder.session.create', {}, options);
        const prompt = await world.kernel.exec('kvcoder.prompt.get', { sessionId: session.id }, options);
        expect(prompt.sections).toContainEqual(expect.objectContaining({ id: 'guide', owner: '@kvman/kvcustomizer', reach: 'global', included: true }));
        expect(prompt.prompt).toContain('docs get');
      }
      await world.kernel.restart();
    }
  });

  it('QA5-H7 and QA5-H8 each connector says when to use it, and the guide sends the connectors their work and file edits to fs', async () => {
    const { kernel } = await kvcustomizer.start();
    const descriptions = new Map((await kernel.exec('kvcoder.connector.list', {})).filter((connector) => connector.owner === '@kvman/kvcustomizer').map((connector) => [connector.name, connector.description]));
    expect(descriptions.get('kvman')).toContain('Use it for any change to kvman itself.');
    expect(descriptions.get('ext')).toContain('run check, then test, after changing one');
    expect(descriptions.get('preset')).toContain('check it before running it');
    expect(descriptions.get('preview')).toContain('stop it when you are done');
    expect(descriptions.get('docs')).toContain('Use it before you write an extension, a preset, a view, or a component, and to learn how to use an extension that is installed.');
    const session = await kernel.exec('kvcoder.session.create', {});
    const { prompt } = await kernel.exec('kvcoder.prompt.get', { sessionId: session.id });
    expect(prompt).toContain('Use the connectors `kvman`, `ext`, `preset`, `preview`, and `docs` for everything they cover, and `shell` only for the rest. Read and edit a project\'s files with `fs`.');
    expect(prompt).not.toContain('with the shell.');
  });

  it('QA17-H14 the extension is kvcustomizer with its commands, queries, and docs, all public', async () => {
    const manifest = z.object({ name: z.string(), kvman: z.object({ namespace: z.string() }).loose() }).loose().parse(JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')));
    expect(manifest.name).toBe('@kvman/kvcustomizer');
    expect(manifest.kvman.namespace).toBe('kvcustomizer');
    const { kernel } = await kvcustomizer.start();
    const listed = await kernel.exec('kernel.extensions.list', {});
    const extension = listed.find((entry) => entry.name === '@kvman/kvcustomizer');
    expect(extension?.namespace).toBe('kvcustomizer');
    expect(extension?.commands.map((command) => command.name).sort()).toEqual(
      ['kvcustomizer.ext.new', 'kvcustomizer.ext.check', 'kvcustomizer.ext.test', 'kvcustomizer.preset.new', 'kvcustomizer.preset.check', 'kvcustomizer.preview.start', 'kvcustomizer.preview.stop', 'kvcustomizer.app.model.set', 'kvcustomizer.app.settings.set', 'kvcustomizer.app.settings.reset', 'kvcustomizer.app.extensions.install', 'kvcustomizer.app.extensions.uninstall'].sort(),
    );
    expect(extension?.queries.map((query) => query.name).sort()).toEqual(['kvcustomizer.app.extensions.list', 'kvcustomizer.app.model.list', 'kvcustomizer.app.preset.get', 'kvcustomizer.app.settings.list', 'kvcustomizer.docs.get', 'kvcustomizer.docs.list', 'kvcustomizer.ext.list', 'kvcustomizer.guides.get', 'kvcustomizer.guides.list', 'kvcustomizer.preview.status'].sort());
    for (const command of extension?.commands ?? []) expect(command.public).toBe(true);
    for (const query of extension?.queries ?? []) expect(query.public).toBe(true);
  });
});
