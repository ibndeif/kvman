import { mkdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { z } from '@kvman/sdk';
import { useKvai } from './support/kvai-kernel.ts';

const kvai = useKvai();

const problem = (code: string, params?: Record<string, unknown>) => ({ problem: params === undefined ? { code } : { code, params } });
const key = 'sk-ant-m22-secret';

describe("kvai's provider keys and default model (07 §7.2, ADR 0009, 79–80)", () => {
  it('M2.2-H10 a key is saved and removed by sync calls only, and never reaches a job row or the log', async () => {
    const { kernel } = await kvai.start();
    await kernel.exec('kvai.provider.key.set', { provider: 'anthropic', key });
    expect(await kernel.exec('kernel.secrets.list', {})).toContainEqual({ extension: '@kvman/kvai', name: 'anthropic.apiKey' });
    expect(await kernel.exec('kvai.provider.get', { id: 'anthropic' })).toMatchObject({ id: 'anthropic', status: 'ready' });
    await expect(kernel.execAsync('kvai.provider.key.set', { provider: 'anthropic', key })).rejects.toMatchObject(problem('VALIDATION_FAILED'));
    expect(JSON.stringify(await kernel.exec('kernel.jobs.list', { limit: 1000 }))).not.toContain(key);
    expect(readFileSync(path.join(kernel.home, 'logs', 'kvman.log'), 'utf8')).not.toContain(key);
    await kernel.exec('kvai.provider.key.delete', { provider: 'anthropic' });
    expect(await kernel.exec('kvai.provider.get', { id: 'anthropic' })).toMatchObject({ status: 'needsKey' });
    await expect(kernel.exec('kvai.provider.key.delete', { provider: 'anthropic' })).resolves.toEqual({});
  });

  it("M2.2-E20 provider rows, one provider, unknown providers, and the default model's name and readiness", async () => {
    const { kernel } = await kvai.start({ secrets: { '@kvman/kvai': { 'anthropic.apiKey': key } }, settings: { 'kvai.defaultModel': 'anthropic/claude-sonnet-5-5' } });
    await kernel.exec('kvai.provider.add', { id: 'relay', title: 'Relay', delegate: 'harness.turn' });
    const rows = await kernel.exec('kvai.provider.list', {});
    const anthropicModels = (await kernel.exec('kvai.model.list', { provider: 'anthropic' })).length;
    expect(rows).toContainEqual({ id: 'anthropic', title: 'Anthropic', builtIn: true, status: 'ready', models: anthropicModels, connection: 'apiKey', signIn: true, apiKey: true });
    expect(rows).toContainEqual(expect.objectContaining({ id: 'openai', status: 'needsKey' }));
    expect(rows).toContainEqual({ id: 'fake', title: 'Fake', builtIn: false, status: 'noKey', models: 2, connection: null, signIn: false, apiKey: true });
    expect(rows).toContainEqual({ id: 'relay', title: 'Relay', builtIn: false, status: 'noKey', models: 0, connection: null, signIn: false, apiKey: true });
    expect(await kernel.exec('kvai.provider.get', { id: 'fake' })).toEqual({ id: 'fake', title: 'Fake', builtIn: false, status: 'noKey', models: 2, connection: null, signIn: false, apiKey: true });
    await expect(kernel.exec('kvai.provider.get', { id: 'nowhere' })).rejects.toMatchObject(problem('kvai/PROVIDER_UNKNOWN', { provider: 'nowhere' }));
    await expect(kernel.exec('kvai.provider.key.set', { provider: 'nowhere', key })).rejects.toMatchObject(problem('kvai/PROVIDER_UNKNOWN', { provider: 'nowhere' }));
    await expect(kernel.exec('kvai.provider.key.delete', { provider: 'nowhere' })).rejects.toMatchObject(problem('kvai/PROVIDER_UNKNOWN', { provider: 'nowhere' }));

    expect(await kernel.exec('kvai.model.default.get', {})).toEqual({ id: 'anthropic/claude-sonnet-5-5', name: 'Claude Sonnet 5.5', ready: true });
    const defaults = (await kernel.exec('kvai.model.list', {})).filter((model) => model.isDefault).map((model) => model.id);
    expect(defaults).toEqual(['anthropic/claude-sonnet-5-5']);

    const folder = path.join(kernel.homeFolder, 'project');
    mkdirSync(folder);
    const project = await kernel.exec('kernel.workspace.open', { path: folder });
    await kernel.exec('kernel.settings.set', { key: 'kvai.defaultModel', value: 'fake/m1', scope: 'workspace' }, { workspaceId: project.id });
    expect(await kernel.exec('kvai.model.default.get', {}, { workspaceId: project.id })).toEqual({ id: 'fake/m1', name: 'M1', ready: true });
    const openaiModel = (await kernel.exec('kvai.model.list', { provider: 'openai' }))[0];
    await kernel.exec('kernel.settings.set', { key: 'kvai.defaultModel', value: openaiModel?.id ?? '', scope: 'global' });
    expect(await kernel.exec('kvai.model.default.get', {})).toEqual({ id: openaiModel?.id, name: openaiModel?.name, ready: false });
    await kernel.exec('kernel.settings.set', { key: 'kvai.defaultModel', value: null, scope: 'global' });
    expect(await kernel.exec('kvai.model.default.get', {})).toEqual({ id: null, name: null, ready: false });

    const info = (await kernel.exec('kernel.extensions.list', {})).find((extension) => extension.name === '@kvman/kvai');
    const keySet = info?.commands.find((command) => command.name === 'kvai.provider.key.set');
    const keySchema = z.object({ properties: z.object({ key: z.object({ writeOnly: z.literal(true) }) }) });
    expect(keySchema.safeParse(keySet?.input).success).toBe(true);
  });
});
