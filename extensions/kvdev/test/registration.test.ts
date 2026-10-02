import { describe, expect, it } from 'vitest';
import { useKvdev } from './support/kvdev-kernel.ts';

const kvdev = useKvdev();

const expected = [
  { name: 'docs', commands: ['get'] },
  { name: 'ext', commands: ['new', 'list', 'check', 'test'] },
  { name: 'preset', commands: ['new', 'check'] },
  { name: 'preview', commands: ['start', 'stop', 'status'] },
];

describe("kvdev's connectors and section (09 §9.1, §9.4)", { timeout: 30_000 }, () => {
  it('M2.5-E35 kvcoder lists the four connectors and every workspace prompt has the guide section, again after a restart', async () => {
    const world = await kvdev.start();
    const second = await world.kernel.exec('kernel.workspace.open', { path: world.write('second/.keep', '').replace(/[/\\]\.keep$/, '') });
    for (let round = 0; round < 2; round += 1) {
      await world.kernel.clock.advance(0);
      const connectors = (await world.kernel.exec('kvcoder.connector.list', {})).filter((connector) => connector.owner === '@kvman/kvdev');
      expect(connectors.map((connector) => ({ name: connector.name, commands: connector.commands?.map((command) => command.name) })).sort((a, b) => a.name.localeCompare(b.name))).toEqual(expected);
      for (const workspaceId of [undefined, second.id]) {
        const options = workspaceId === undefined ? {} : { workspaceId };
        const session = await world.kernel.exec('kvcoder.session.create', {}, options);
        const prompt = await world.kernel.exec('kvcoder.prompt.get', { sessionId: session.id }, options);
        expect(prompt.sections).toContainEqual(expect.objectContaining({ id: 'guide', owner: '@kvman/kvdev', reach: 'global', included: true }));
        expect(prompt.prompt).toContain('docs get');
      }
      await world.kernel.restart();
    }
  });

  it('QA5-H7 and QA5-H8 each connector says when to use it, and the guide sends the connectors their work and file edits to fs', async () => {
    const { kernel } = await kvdev.start();
    const descriptions = new Map((await kernel.exec('kvcoder.connector.list', {})).filter((connector) => connector.owner === '@kvman/kvdev').map((connector) => [connector.name, connector.description]));
    expect(descriptions.get('ext')).toContain('run check, then test, after changing one');
    expect(descriptions.get('preset')).toContain('check it before running it');
    expect(descriptions.get('preview')).toContain('stop it when you are done');
    expect(descriptions.get('docs')).toContain('Use it before you write an extension, a preset, a view, or a component.');
    const session = await kernel.exec('kvcoder.session.create', {});
    const { prompt } = await kernel.exec('kvcoder.prompt.get', { sessionId: session.id });
    expect(prompt).toContain('Use the connectors `ext`, `preset`, `preview`, and `docs` for everything they cover, and the shell only for the rest. Edit a project\'s files with `fs`.');
    expect(prompt).not.toContain('with the shell.');
  });
});
