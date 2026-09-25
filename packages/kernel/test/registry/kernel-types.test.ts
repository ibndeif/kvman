import { describe, expect, it } from 'vitest';
import { KernelRegistry, kernelTypeEntries } from '../../src/index.ts';
import { handlerPublish } from '../router/outcomes.ts';
import { openRouterFixture, ulids } from '../router/harness.ts';
import { command, manifest, workspaceA, workspaceB } from './manifests.ts';

const pdf = manifest('@acme/pdf', 'pdf', { types: [command('pdf.translate')] });

function registry(enabled: ReadonlyMap<string, readonly string[]>): KernelRegistry {
  const build = KernelRegistry.build({ extensions: [{ manifest: pdf, quarantined: false }], enabled });
  if (!build.ok) throw new Error(build.failure.detail);
  return build.registry;
}

describe('kernel types in the registry (ADR 0061)', () => {
  it('M1.5-E22 the kernel owns kernel.message.dead-lettered everywhere, and only it publishes it', async () => {
    const withPdf = registry(new Map([[workspaceA, ['@acme/pdf']]]));
    expect(withPdf.lookup('kernel.message.dead-lettered', workspaceB)).toMatchObject({ ok: true, resolved: { extension: 'kernel', global: false } });
    expect(withPdf.lookup('kernel.message.dead-lettered', undefined)).toMatchObject({ ok: true, resolved: { extension: 'kernel', global: true } });
    expect(registry(new Map()).lookup('kernel.message.dead-lettered', undefined)).toMatchObject({ ok: true, resolved: { extension: 'kernel' } });

    const fixture = openRouterFixture();
    const payload = { messageId: ulids.next(), type: 'pdf.translate', correlationId: ulids.next() };
    expect(await handlerPublish(fixture, '@acme/pdf', { type: 'kernel.message.dead-lettered', payload })).toBe('CAPABILITY_DENIED');
  });

  it('M1.8-E67 the new kernel types are registered', () => {
    const entries = new Map(kernelTypeEntries().map((entry) => [entry.type, entry]));
    expect(entries.get('kernel.health.get')).toMatchObject({ kind: 'query', access: 'all', handler: 'query:kernel.health.get', input: { type: 'object' }, output: { type: 'object' } });
    expect(entries.get('kernel.shutdown')).toMatchObject({ kind: 'command', access: 'user', handler: 'command:kernel.shutdown', input: { type: 'object' }, output: { type: 'object' } });
    expect(entries.get('kernel.started')).toMatchObject({ kind: 'event', delivery: 'transient', payload: { type: 'object', required: ['version', 'instanceId'] } });
    expect(registry(new Map()).lookup('kernel.health.get', undefined)).toMatchObject({ ok: true, resolved: { extension: 'kernel', global: true } });
  });
});
