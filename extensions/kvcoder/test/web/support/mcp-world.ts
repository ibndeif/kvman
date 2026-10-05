import { ProblemError } from '@kvman/sdk';
import type { McpServerEntry } from '../../../web/src/mcp-server-entry.ts';
import { createFakeKvman, type FakeKvman } from './fake-kvman.ts';
import { serveSettings, type ScopedValues } from './settings-world.ts';

// kvman as the MCP dialog sees it: the servers setting, kvcoder's secret names (never a value), and each server's check.

export const github: McpServerEntry = { name: 'github', description: 'Issues and pull requests.', command: 'npx', args: ['-y', 'server-github'], env: ['TOKEN'] };
export const linear: McpServerEntry = { name: 'linear', description: 'The team tracker.', url: 'https://mcp.linear.app/mcp', headers: ['Authorization'] };

export type McpWorld = { fake: FakeKvman; secrets: Set<string>; values: Partial<ScopedValues> };

type Check = { status: 'ready'; tools: number } | { status: 'signInNeeded' } | { status: 'failed'; problem: { code: string; message: string; params?: Record<string, string> } };

export const failed: Check = { status: 'failed', problem: { code: 'kvcoder/MCP_CONNECT_FAILED', message: 'x', params: { server: 'linear', reason: 'connect ECONNREFUSED' } } };

export function mcpWorld(values: Partial<ScopedValues> = {}, options: { secrets?: string[]; checks?: Record<string, Check>; failSet?: boolean } = {}): McpWorld {
  const fake = createFakeKvman();
  const secrets = new Set(options.secrets ?? []);
  const settings = { 'kvcoder.mcp.servers': { default: [], ...values }, 'kvcoder.connectors.disabled': { default: [] } };
  serveSettings(fake, settings, options.failSet === true);
  fake.handle('kvcoder.connector.list', () => []);
  fake.handle('kernel.secrets.list', () => [...secrets].map((name) => ({ extension: '@kvman/kvcoder', name })).concat([{ extension: '@kvman/kvai', name: 'mcp.github.env.OTHER' }]));
  fake.handle('kernel.secrets.set', (input) => {
    secrets.add(String(input['name']));
    return {};
  });
  fake.handle('kernel.secrets.delete', (input) => {
    secrets.delete(String(input['name']));
    return {};
  });
  fake.handle('kvcoder.mcp.server.check', (input) => {
    const check = options.checks?.[String(input['name'])];
    if (check === undefined) throw new ProblemError({ code: 'kvcoder/MCP_SERVER_NOT_FOUND', message: 'x', params: { server: String(input['name']) } });
    return check;
  });
  return { fake, secrets, values: settings['kvcoder.mcp.servers'] };
}

/** The calls that changed something, in order. */
export const changes = (fake: FakeKvman) => fake.calls.filter((call) => ['kernel.settings.set', 'kernel.settings.reset', 'kernel.secrets.set', 'kernel.secrets.delete'].includes(call.name));
