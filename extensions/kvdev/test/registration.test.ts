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
});
