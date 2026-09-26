import { afterEach, describe, expect, it } from 'vitest';
import { workspaceA, workspaceB } from '../hosts/harness.ts';
import { type InstallFixture } from '../install/harness.ts';
import { admission, disable, enable, grantsOf, openWorkspaceFixture, run, valueOf, workspaceTests } from './harness.ts';

let fixture: InstallFixture | undefined;

afterEach(async () => {
  await fixture?.close();
  fixture = undefined;
});

describe('routing from applied presets (plan 06 §6.4, ADR 0123)', workspaceTests, () => {
  it('M2.3-E26 a global handler runs with the intersection of its grants across the workspaces that enable it', async () => {
    const current = fixture = await openWorkspaceFixture();
    valueOf(await enable(current, workspaceA, '@acme/desk'));
    valueOf(await enable(current, workspaceA, '@acme/pdf-a'));
    const relay = grantsOf(current, '@acme/relay', 'shared');
    current.enable(workspaceA, '@acme/relay', relay);
    current.enable(workspaceB, '@acme/relay', { ...relay, requested: [{ name: 'calls', types: ['desk.*'] }] });
    expect(await run(current, 'relay.both', {})).toEqual({ ok: true, value: { desk: 'ok', pdf: 'CAPABILITY_DENIED' } });
  });

  it('M2.3-E27 a restarted kernel reads the enabled set and grants from the presets', async () => {
    const first = fixture = await openWorkspaceFixture();
    valueOf(await enable(first, workspaceA, '@acme/desk'));
    valueOf(await enable(first, workspaceB, '@acme/desk'));
    valueOf(await disable(first, workspaceB, '@acme/desk'));
    const { home } = first;
    await first.close();
    fixture = undefined;
    const restarted = fixture = await openWorkspaceFixture({ home });
    expect(await admission(restarted, 'desk.note', { lane: 'x' }, undefined, workspaceA)).toBe('admitted');
    expect(await admission(restarted, 'desk.note', { lane: 'x' }, undefined, workspaceB)).toBe('HANDLER_UNAVAILABLE');
    expect(restarted.runtime.registry.capabilities('@acme/desk', workspaceA)).toEqual(grantsOf(restarted, '@acme/desk'));
  });
});
