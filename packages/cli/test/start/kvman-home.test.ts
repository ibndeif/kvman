import { describe, expect, it } from 'vitest';
import { api, outputOf } from '../support/api.ts';
import { startKvman } from '../support/kvman-child.ts';
import { appExtension, useSandbox } from '../support/sandbox.ts';

const sandbox = useSandbox();

const probeEntry = `
import { z, type Ctx } from '@kvman/sdk';

export default (ctx: Ctx): void => {
  ctx.registerQuery('probe.home.get', {
    description: 'Gives the KVMAN_HOME this kvman runs with.',
    public: true,
    input: z.object({}),
    output: z.object({ home: z.string().nullable() }),
    handle: () => ({ home: process.env['KVMAN_HOME'] ?? null }),
  });
};
`;

describe("kvman's environment (01 §1.2, ADR 0010, 19)", { timeout: 60_000 }, () => {
  it('QA17-H29 kvman sets KVMAN_HOME to its home, so a program it runs finds the kvman that runs it', async () => {
    const world = sandbox();
    world.writeExtension(appExtension);
    world.writeExtension({ name: '@test/probe', namespace: 'probe', entry: probeEntry });
    const preset = world.writePreset('probe.json', {
      name: 'probe',
      extensions: { '@test/app': 'path:./app', '@test/probe': 'path:./probe' },
      settings: { 'kernel.web.home': 'app', 'kernel.workers': 1 },
    });
    const running = await startKvman(world, ['--preset', preset]);
    expect(outputOf(await api(running.port).query('probe.home.get', {}))).toEqual({ home: world.home });
  });
});
