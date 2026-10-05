import { describe, expect, it } from 'vitest';
import { useKvcoder } from './support/kvcoder-kernel.ts';
import { fixtureTools } from './support/mcp-fixture-server.ts';
import { commandEntry, setServers } from './support/mcp-servers.ts';

const kvcoder = useKvcoder();

const url = { name: 'remote', description: 'Over HTTP.', url: 'https://mcp.example.com/mcp', headers: ['Authorization'] };

describe('the kvcoder.mcp.servers setting and the server check (08 §8.5 and §8.6, ADR 0020, 9 and 14)', { timeout: 60_000 }, () => {
  it('QA29-H8 kvcoder.mcp.server.check says a server is ready, with its tools counted', async () => {
    const { kernel } = await kvcoder.start();
    await setServers(kernel, [commandEntry(), url]);
    expect(await kernel.exec('kvcoder.mcp.server.check', { name: 'demo' })).toEqual({ status: 'ready', tools: fixtureTools.length });
    const setting = (await kernel.exec('kernel.settings.list', {})).find((candidate) => candidate.key === 'kvcoder.mcp.servers');
    expect(setting).toMatchObject({ source: 'global', scopes: ['global', 'workspace'] });
  });

  it('QA29-E19 a list that is not valid fails VALIDATION_FAILED and is not stored', async () => {
    const { kernel } = await kvcoder.start();
    const command = commandEntry();
    const invalid: unknown[][] = [
      [{ ...command, name: 'My Server' }],
      [command, { ...url, name: 'demo' }],
      [{ ...command, url: 'https://mcp.example.com' }],
      [{ ...command, extra: true }],
      [{ ...url, url: 'file:///etc/passwd' }],
      [{ ...url, url: 'not an address' }],
      [{ ...command, env: ['MY TOKEN'] }],
      [{ ...url, headers: ['Authorization:'] }],
      [{ ...command, description: '' }],
    ];
    for (const value of invalid) {
      await expect(kernel.exec('kernel.settings.set', { key: 'kvcoder.mcp.servers', value: value as never, scope: 'global' }), JSON.stringify(value)).rejects.toMatchObject({ problem: { code: 'VALIDATION_FAILED' } });
    }
    expect((await kernel.exec('kernel.settings.list', {})).find((candidate) => candidate.key === 'kvcoder.mcp.servers')).toMatchObject({ value: [], source: 'default' });
  });

  it("QA29-E20 mcp is kvcoder's own name: an extension cannot register it", async () => {
    const { kernel } = await kvcoder.start();
    const register = kernel.exec('kvcoder.connector.register', { name: 'mcp', description: 'Mine.', binary: { check: 'true' } }, { as: '@test/todo' });
    await expect(register).rejects.toMatchObject({ problem: { code: 'kvcoder/NAME_TAKEN', params: { name: 'mcp' } } });
  });
});
