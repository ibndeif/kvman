import { describe, expect, it } from 'vitest';
import { KernelRegistry, type InstalledExtension, type RegistryInput, type TypeLookup } from '../../src/index.ts';
import { command, event, manifest, query, subscription, workspaceA, workspaceB } from './manifests.ts';

const pdf = manifest('@acme/pdf', 'pdf', {
  types: [command('pdf.translate'), query('pdf.files.list'), event('pdf.imported'), event('pdf.progress.updated', 'live'), command('pdf.login.start', 'global')],
});

function registry(extensions: InstalledExtension[], enabled: Array<[string, string[]]>): KernelRegistry {
  const input: RegistryInput = { extensions, enabled: new Map(enabled) };
  const build = KernelRegistry.build(input);
  if (!build.ok) throw new Error(build.failure.detail);
  return build.registry;
}

function failureCode(lookup: TypeLookup): string | undefined {
  return lookup.ok ? undefined : lookup.failure.code;
}

describe('kernel registry (plan 03 §3.3 step 3, ADRs 0045, 0048)', () => {
  it('M1.3-E16 an enabled owner resolves its type; an unregistered type is TYPE_NOT_FOUND', () => {
    const kernel = registry([{ manifest: pdf, quarantined: false }], [[workspaceA, ['@acme/pdf']]]);
    expect(kernel.lookup('pdf.translate', workspaceA)).toEqual({
      ok: true, resolved: { extension: '@acme/pdf', entry: pdf.types[0], global: false },
    });
    expect(kernel.lookup('pdf.files.list', workspaceA)).toMatchObject({ ok: true, resolved: { entry: { kind: 'query', handler: 'query:pdf.files.list' } } });
    expect(kernel.lookup('pdf.unknown', workspaceA)).toEqual({ ok: false, failure: { code: 'TYPE_NOT_FOUND', detail: 'no installed extension registers "pdf.unknown"' } });
  });

  it('M1.3-E17 an owner not enabled in the workspace, or quarantined, is HANDLER_UNAVAILABLE', () => {
    expect(failureCode(registry([{ manifest: pdf, quarantined: false }], [[workspaceB, ['@acme/pdf']]]).lookup('pdf.translate', workspaceA))).toBe('HANDLER_UNAVAILABLE');
    expect(failureCode(registry([{ manifest: pdf, quarantined: true }], [[workspaceA, ['@acme/pdf']]]).lookup('pdf.translate', workspaceA))).toBe('HANDLER_UNAVAILABLE');
  });

  it('M1.3-E18 two extensions of one namespace resolve per workspace', () => {
    const other = manifest('@other/pdf', 'pdf', { types: [command('pdf.translate')] });
    const kernel = registry([{ manifest: pdf, quarantined: false }, { manifest: other, quarantined: false }], [[workspaceA, ['@acme/pdf']], [workspaceB, ['@other/pdf']]]);
    expect(kernel.lookup('pdf.translate', workspaceA)).toMatchObject({ ok: true, resolved: { extension: '@acme/pdf' } });
    expect(kernel.lookup('pdf.translate', workspaceB)).toMatchObject({ ok: true, resolved: { extension: '@other/pdf' } });
  });

  it('M1.3-E19 two enabled extensions with one namespace in a workspace fail NAMESPACE_CONFLICT', () => {
    const other = manifest('@other/pdf', 'pdf', { types: [] });
    const build = KernelRegistry.build({
      extensions: [{ manifest: pdf, quarantined: false }, { manifest: other, quarantined: false }],
      enabled: new Map([[workspaceA, ['@acme/pdf', '@other/pdf']]]),
    });
    expect(build).toMatchObject({ ok: false, failure: { code: 'NAMESPACE_CONFLICT' } });
  });

  it('M1.3-E20 without a workspace only global-scope types and events resolve', () => {
    const kernel = registry([{ manifest: pdf, quarantined: false }], [[workspaceA, ['@acme/pdf']]]);
    expect(kernel.lookup('pdf.translate', undefined)).toEqual({
      ok: false, failure: { code: 'WORKSPACE_INVALID', detail: '"pdf.translate" needs a workspace and the message has none', hint: 'send it with a workspace id' },
    });
    expect(failureCode(kernel.lookup('pdf.files.list', undefined))).toBe('WORKSPACE_INVALID');
    expect(kernel.lookup('pdf.login.start', undefined)).toMatchObject({ ok: true, resolved: { extension: '@acme/pdf', global: true } });
    expect(kernel.lookup('pdf.imported', undefined)).toMatchObject({ ok: true, resolved: { global: true } });
    expect(failureCode(registry([{ manifest: pdf, quarantined: false }], []).lookup('pdf.login.start', undefined))).toBe('HANDLER_UNAVAILABLE');
    expect(failureCode(registry([{ manifest: pdf, quarantined: true }], [[workspaceA, ['@acme/pdf']]]).lookup('pdf.login.start', undefined))).toBe('HANDLER_UNAVAILABLE');
  });

  it('M1.3-E21 a global-scope type with a workspace resolves globally; two global owners conflict', () => {
    const kernel = registry([{ manifest: pdf, quarantined: false }], [[workspaceA, ['@acme/pdf']], [workspaceB, []]]);
    expect(kernel.lookup('pdf.login.start', workspaceB)).toMatchObject({ ok: true, resolved: { extension: '@acme/pdf', global: true } });
    const other = manifest('@other/pdf', 'pdf', { types: [command('pdf.login.start', 'global')] });
    const clash = registry([{ manifest: pdf, quarantined: false }, { manifest: other, quarantined: false }], [[workspaceA, ['@acme/pdf']], [workspaceB, ['@other/pdf']]]);
    expect(failureCode(clash.lookup('pdf.login.start', workspaceA))).toBe('NAMESPACE_CONFLICT');
    expect(failureCode(clash.lookup('pdf.login.start', undefined))).toBe('NAMESPACE_CONFLICT');
  });

  it('M1.3-E22 subscribers match exactly or by pattern, only where enabled, never for live events', () => {
    const agent = manifest('@kvman/agent', 'agent', { subscriptions: [subscription('pdf.imported')] });
    const audit = manifest('@acme/audit', 'audit', { subscriptions: [subscription('pdf.*')] });
    const idle = manifest('@acme/idle', 'idle', { subscriptions: [subscription('pdf.imported')] });
    const broken = manifest('@acme/broken', 'broken', { subscriptions: [subscription('pdf.imported')] });
    const kernel = registry(
      [{ manifest: pdf, quarantined: false }, { manifest: agent, quarantined: false }, { manifest: audit, quarantined: false },
        { manifest: idle, quarantined: false }, { manifest: broken, quarantined: true }],
      [[workspaceA, ['@acme/pdf', '@kvman/agent', '@acme/audit', '@acme/broken']], [workspaceB, ['@acme/idle']]],
    );
    expect(kernel.subscribers('pdf.imported', workspaceA)).toEqual([
      { extension: '@kvman/agent', subscription: agent.subscriptions[0] },
      { extension: '@acme/audit', subscription: audit.subscriptions[0] },
    ]);
    expect(kernel.subscribers('pdf.file.imported', workspaceA).map((subscriber) => subscriber.extension)).toEqual(['@acme/audit']);
    expect(kernel.subscribers('pdf.progress.updated', workspaceA)).toEqual([]);
  });

  it('M1.3-E23 an event without a workspace goes once to each subscriber enabled somewhere', () => {
    const agent = manifest('@kvman/agent', 'agent', { subscriptions: [subscription('kernel.extension.quarantined')] });
    const idle = manifest('@acme/idle', 'idle', { subscriptions: [subscription('kernel.*')] });
    const kernel = registry([{ manifest: agent, quarantined: false }, { manifest: idle, quarantined: false }], [[workspaceA, ['@kvman/agent']], [workspaceB, ['@kvman/agent']]]);
    expect(kernel.subscribers('kernel.extension.quarantined', undefined)).toEqual([{ extension: '@kvman/agent', subscription: agent.subscriptions[0] }]);
  });
});
