import { describe, expect, it } from 'vitest';
import { useKvbuilder } from './support/kvbuilder-kernel.ts';

const kvbuilder = useKvbuilder();
const failed = (code: string) => expect.objectContaining({ problem: expect.objectContaining({ code }) });

describe("the kvman connector's reads and query-get (09 §9.1, ADR 0022, 7, 8, and 13)", { timeout: 60_000 }, () => {
  it('QA34-H8 the five reads answer what the kernel answers, and each is a public query', async () => {
    const { kernel } = await kvbuilder.start();
    expect(await kernel.exec('kvbuilder.app.workspaces.list', {})).toEqual(await kernel.exec('kernel.workspace.list', {}));
    expect(await kernel.exec('kvbuilder.app.processes.list', {})).toEqual(await kernel.exec('kernel.processes.list', {}));
    expect(await kernel.exec('kvbuilder.app.health.get', {})).toMatchObject({ preset: (await kernel.exec('kernel.health.get', {})).preset, mode: 'web' });

    const jobId = await kernel.execAsync('kvbuilder.app.model.set', { model: 'nobody/nothing' });
    await kernel.clock.advance(0);
    const jobs = await kernel.exec('kvbuilder.app.jobs.list', { status: 'failed', limit: 10 });
    expect(jobs).toEqual(await kernel.exec('kernel.jobs.list', { status: 'failed', limit: 10 }));
    expect(jobs.find((job) => job.id === jobId)).toMatchObject({ name: 'kvbuilder.app.model.set', status: 'failed', problem: { code: 'VALIDATION_FAILED' } });
    expect(await kernel.exec('kvbuilder.app.jobs.get', { id: jobId })).toEqual(await kernel.exec('kernel.jobs.get', { id: jobId }));

    const own = (await kernel.exec('kernel.extensions.list', {})).find((extension) => extension.name === '@kvman/kvbuilder');
    for (const name of ['workspaces.list', 'jobs.list', 'jobs.get', 'processes.list', 'health.get', 'query.get']) {
      expect(own?.queries.find((query) => query.name === `kvbuilder.app.${name}`), name).toMatchObject({ public: true });
    }
  });

  it('QA34-H9 query-get runs a public query of the kernel or of an extension', async () => {
    const { kernel } = await kvbuilder.start();
    expect(await kernel.exec('kvbuilder.app.query.get', { name: 'kernel.health.get' })).toMatchObject({ mode: 'web', preset: expect.any(String) });
    expect(await kernel.exec('kvbuilder.app.query.get', { name: 'kvbuilder.guides.get', input: { topic: 'sdk' } })).toMatchObject({ extension: 'kvman', topic: 'sdk', markdown: expect.any(String) });
  });

  it('QA34-E10 query-get refuses a command, of the kernel or of an extension, and nothing is set', async () => {
    const { kernel } = await kvbuilder.start();
    const theme = async () => (await kernel.exec('kernel.settings.list', {})).find((setting) => setting.key === 'kvwebui.theme')?.value;
    const before = await theme();
    await expect(kernel.exec('kvbuilder.app.query.get', { name: 'kernel.settings.set', input: { key: 'kvwebui.theme', value: 'dark', scope: 'global' } })).rejects.toEqual(failed('VALIDATION_FAILED'));
    await expect(kernel.exec('kvbuilder.app.query.get', { name: 'kvbuilder.app.settings.set', input: { key: 'kvwebui.theme', value: 'dark', scope: 'global' } })).rejects.toEqual(failed('VALIDATION_FAILED'));
    expect(await theme()).toBe(before);
  });

  it('QA34-E11 query-get of an unknown or a private name fails NOT_FOUND', async () => {
    const { kernel } = await kvbuilder.start();
    await expect(kernel.exec('kvbuilder.app.query.get', { name: 'nobody.nothing.get' })).rejects.toEqual(failed('NOT_FOUND'));
    const privateQuery = (await kernel.exec('kernel.registrations.list', {})).find((row) => row.kind === 'query' && !row.public);
    expect(privateQuery).toBeDefined();
    await expect(kernel.exec('kvbuilder.app.query.get', { name: String(privateQuery?.name) })).rejects.toEqual(failed('NOT_FOUND'));
  });

  it("QA34-E12 query-get never lists a secret's name", async () => {
    const { kernel } = await kvbuilder.start();
    await kernel.exec('kernel.secrets.set', { extension: '@kvman/kvai', name: 'probe', value: 'S3CRET-VALUE' });
    const error = await kernel.exec('kvbuilder.app.query.get', { name: 'kernel.secrets.list' }).catch((thrown: unknown) => thrown);
    expect(error).toEqual(failed('VALIDATION_FAILED'));
    expect(JSON.stringify(error)).not.toContain('probe');
  });

  it("QA34-E13 the query's own Problem passes through", async () => {
    const { kernel } = await kvbuilder.start();
    const direct = await kernel.exec('kvbuilder.guides.get', { topic: 'nothing' }).catch((thrown: unknown) => thrown);
    const through = await kernel.exec('kvbuilder.app.query.get', { name: 'kvbuilder.guides.get', input: { topic: 'nothing' } }).catch((thrown: unknown) => thrown);
    expect(direct).toEqual(failed('NOT_FOUND'));
    expect(through).toMatchObject({ problem: { code: 'NOT_FOUND', message: (direct as { problem: { message: string } }).problem.message } });
  });
});
