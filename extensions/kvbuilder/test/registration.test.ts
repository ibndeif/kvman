import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { z } from '@kvman/sdk';
import { useKvbuilder } from './support/kvbuilder-kernel.ts';

const kvbuilder = useKvbuilder();

const expected = [
  { name: 'docs', commands: ['list', 'get'] },
  { name: 'ext', commands: ['new', 'list', 'check', 'test'] },
  { name: 'kvman', commands: ['model-list', 'model-set', 'settings-list', 'settings-set', 'settings-reset', 'extensions-list', 'extensions-install', 'extensions-uninstall', 'restart', 'preset-get', 'workspaces-list', 'jobs-list', 'jobs-get', 'processes-list', 'health-get', 'query-get'] },
  { name: 'preset', commands: ['new', 'check'] },
  { name: 'preview', commands: ['start', 'stop', 'status', 'query-get', 'command-run'] },
];

describe("kvbuilder's connectors (09 §9.1, §9.4)", { timeout: 30_000 }, () => {
  it('M2.5-E35 kvcoder lists the connectors, and every workspace prompt has them in its index once building is on, again after a restart', async () => {
    const world = await kvbuilder.start();
    const second = await world.kernel.exec('kernel.workspace.open', { path: world.write('second/.keep', '').replace(/[/\\]\.keep$/, '') });
    for (let round = 0; round < 2; round += 1) {
      await world.kernel.clock.advance(0);
      const connectors = (await world.kernel.exec('kvcoder.connector.list', {})).filter((connector) => connector.owner === '@kvman/kvbuilder');
      expect(connectors.map((connector) => ({ name: connector.name, commands: connector.commands?.map((command) => command.name) })).sort((a, b) => a.name.localeCompare(b.name))).toEqual(expected);
      for (const workspaceId of [undefined, second.id]) {
        const options = workspaceId === undefined ? {} : { workspaceId };
        const session = await world.kernel.exec('kvcoder.session.create', {}, options);
        const prompt = await world.kernel.exec('kvcoder.prompt.get', { sessionId: session.id }, options);
        expect(prompt.sections.filter((section) => section.owner === '@kvman/kvbuilder')).toEqual([]);
        expect(prompt.prompt).not.toContain('- kvman: ');
        await world.kernel.exec('kvbuilder.build.start', { sessionId: session.id, argument: '' }, options);
        const building = await world.kernel.exec('kvcoder.prompt.get', { sessionId: session.id }, options);
        expect(building.prompt).toContain('- kvman: See and change the app you are running in');
        expect(building.prompt).toContain('- docs: Read the guides');
      }
      await world.kernel.restart();
    }
  });

  it('QA19-H16 the preview connector says it runs kvman extension projects only', async () => {
    const { kernel } = await kvbuilder.start();
    const preview = (await kernel.exec('kvcoder.connector.list', {})).find((connector) => connector.name === 'preview');
    expect(preview?.description).toBe('Run kvman extension projects in a separate kvman with a temporary home. Use it to show the person an extension project working, to check a project by calling its commands and queries, and stop it when you are done. It runs nothing else: start any other app or page with shell.');
  });

  it('QA39-H6 kvbuilder registers its slash command, with its texts in both languages', async () => {
    const { kernel } = await kvbuilder.start();
    await kernel.clock.advance(0);
    expect(await kernel.exec('kvcoder.slash.list', {})).toEqual([
      { name: 'build-kvman', description: 'kvbuilder.slash.build-kvman', command: 'kvbuilder.build.start', message: 'kvbuilder.slash.build-kvman.message', owner: '@kvman/kvbuilder' },
    ]);
    const catalog = (language: string) => z.record(z.string(), z.string()).parse(JSON.parse(readFileSync(new URL(`../locales/${language}.json`, import.meta.url), 'utf8')));
    const texts = (language: string) => ['kvbuilder.slash.build-kvman', 'kvbuilder.slash.build-kvman.message', 'kvbuilder.build.started'].map((key) => catalog(language)[key]);
    expect(texts('en')).toEqual(['Start building kvman in this chat', 'I want to change this app.', 'Building kvman is on for this chat']);
    expect(texts('ar')).toEqual(['ابدأ بناء kvman في هذه المحادثة', 'أريد تغيير هذا التطبيق.', 'بناء kvman مفعّل في هذه المحادثة']);
  });

  it("QA39-H7 kvbuilder's five connectors are optIn", async () => {
    const { kernel } = await kvbuilder.start();
    await kernel.clock.advance(0);
    const own = (await kernel.exec('kvcoder.connector.list', {})).filter((connector) => connector.owner === '@kvman/kvbuilder');
    expect(own.map((connector) => [connector.name, connector.optIn]).sort()).toEqual([['docs', true], ['ext', true], ['kvman', true], ['preset', true], ['preview', true]]);
  });

  it('QA39-H8 there is no init: not a command of kvman, not in its description, and no guide query', async () => {
    const { kernel } = await kvbuilder.start();
    await kernel.clock.advance(0);
    const kvman = (await kernel.exec('kvcoder.connector.list', {})).find((connector) => connector.name === 'kvman');
    expect(kvman?.commands?.map((command) => command.name)).not.toContain('init');
    expect(kvman?.commands?.[0]?.name).toBe('model-list');
    expect(kvman?.description.startsWith('See and change the app you are running in:')).toBe(true);
    expect(kvman?.description).not.toContain('init');
    expect((await kernel.exec('kernel.registrations.list', {})).filter((row) => row.name === 'kvbuilder.app.guide.get')).toEqual([]);
  });

  it('QA34-H4, QA34-H10, and QA36-H11 only the six commands that change the app ask the person, and the new commands run their kernel commands', async () => {
    const { kernel } = await kvbuilder.start();
    const own = (await kernel.exec('kvcoder.connector.list', {})).filter((connector) => connector.owner === '@kvman/kvbuilder');
    const asking = own.flatMap((connector) => (connector.commands ?? []).filter((command) => command.asks).map((command) => `${connector.name} ${command.name}`));
    expect(asking).toEqual(['kvman model-set', 'kvman settings-set', 'kvman settings-reset', 'kvman extensions-install', 'kvman extensions-uninstall', 'kvman restart']);
    const commandOf = (connector: string, name: string) => own.find((candidate) => candidate.name === connector)?.commands?.find((command) => command.name === name)?.command;
    expect(['workspaces-list', 'jobs-list', 'jobs-get', 'processes-list', 'health-get', 'query-get'].map((name) => commandOf('kvman', name))).toEqual([
      'kvbuilder.app.workspaces.list',
      'kvbuilder.app.jobs.list',
      'kvbuilder.app.jobs.get',
      'kvbuilder.app.processes.list',
      'kvbuilder.app.health.get',
      'kvbuilder.app.query.get',
    ]);
    expect(['query-get', 'command-run'].map((name) => commandOf('preview', name))).toEqual(['kvbuilder.preview.query.get', 'kvbuilder.preview.command.run']);
  });

  it('QA5-H7 each connector says when to use it', async () => {
    const { kernel } = await kvbuilder.start();
    const descriptions = new Map((await kernel.exec('kvcoder.connector.list', {})).filter((connector) => connector.owner === '@kvman/kvbuilder').map((connector) => [connector.name, connector.description]));
    expect(descriptions.get('kvman')).toContain('Use it for any change to kvman itself.');
    expect(descriptions.get('ext')).toContain('run check, then test, after changing one');
    expect(descriptions.get('preset')).toContain('check it before running it');
    expect(descriptions.get('preview')).toContain('stop it when you are done');
    expect(descriptions.get('docs')).toContain('Use it before you write an extension, a preset, a view, or a component, and to learn how to use an extension that is installed.');
  });

  it('QA17-H14 the extension is kvbuilder with its commands, queries, and docs, all public', async () => {
    const manifest = z.object({ name: z.string(), kvman: z.object({ namespace: z.string() }).loose() }).loose().parse(JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')));
    expect(manifest.name).toBe('@kvman/kvbuilder');
    expect(manifest.kvman.namespace).toBe('kvbuilder');
    const { kernel } = await kvbuilder.start();
    const listed = await kernel.exec('kernel.extensions.list', {});
    const extension = listed.find((entry) => entry.name === '@kvman/kvbuilder');
    expect(extension?.namespace).toBe('kvbuilder');
    expect(extension?.commands.map((command) => command.name).sort()).toEqual(
      ['kvbuilder.build.start', 'kvbuilder.ext.new', 'kvbuilder.ext.check', 'kvbuilder.ext.test', 'kvbuilder.preset.new', 'kvbuilder.preset.check', 'kvbuilder.preview.start', 'kvbuilder.preview.stop', 'kvbuilder.preview.command.run', 'kvbuilder.app.model.set', 'kvbuilder.app.settings.set', 'kvbuilder.app.settings.reset', 'kvbuilder.app.extensions.install', 'kvbuilder.app.extensions.uninstall', 'kvbuilder.app.restart'].sort(),
    );
    expect(extension?.queries.map((query) => query.name).sort()).toEqual(['kvbuilder.app.extensions.list', 'kvbuilder.app.model.list', 'kvbuilder.app.preset.get', 'kvbuilder.app.settings.list', 'kvbuilder.docs.get', 'kvbuilder.docs.list', 'kvbuilder.ext.list', 'kvbuilder.guides.get', 'kvbuilder.guides.list', 'kvbuilder.preview.status', 'kvbuilder.preview.query.get', 'kvbuilder.app.workspaces.list', 'kvbuilder.app.jobs.list', 'kvbuilder.app.jobs.get', 'kvbuilder.app.processes.list', 'kvbuilder.app.health.get', 'kvbuilder.app.query.get'].sort());
    for (const command of extension?.commands ?? []) expect(command.public).toBe(true);
    for (const query of extension?.queries ?? []) expect(query.public).toBe(true);
  });
});
