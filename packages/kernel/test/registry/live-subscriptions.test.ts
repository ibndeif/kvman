import { describe, expect, it } from 'vitest';
import { KernelRegistry } from '../../src/index.ts';
import { event, manifest, subscription, workspaceA } from './manifests.ts';

const counter = manifest('@acme/counter', 'counter', { types: [event('counter.progress.updated', 'live'), event('counter.reset')] });

function build(pattern: string): ReturnType<typeof KernelRegistry.build> {
  const audit = manifest('@acme/audit', 'audit', { subscriptions: [subscription(pattern)] });
  return KernelRegistry.build({
    extensions: [counter, audit].map((installed) => ({ manifest: installed, quarantined: false })),
    enabled: new Map([[workspaceA, ['@acme/counter', '@acme/audit']]]),
  });
}

describe('subscriptions to live events (ADR 0068)', () => {
  it('M1.6-E39 an exact subscription to another extension\'s live event fails the registry; a wildcard never matches it', () => {
    const exact = build('counter.progress.updated');
    expect(exact.ok).toBe(false);
    if (exact.ok) return;
    expect(exact.failure.code).toBe('EXT_MANIFEST_INVALID');
    expect(exact.failure.detail).toContain('@acme/audit');
    expect(exact.failure.detail).toContain('counter.progress.updated');

    const wildcard = build('counter.*');
    expect(wildcard.ok).toBe(true);
    if (!wildcard.ok) return;
    expect(wildcard.registry.subscribers('counter.progress.updated', workspaceA)).toEqual([]);
    expect(wildcard.registry.subscribers('counter.reset', workspaceA).map((subscriber) => subscriber.extension)).toEqual(['@acme/audit']);
  });
});
