import { describe, expect, it } from 'vitest';
import { applyEvent, idleLive } from '../../web/src/live-step.ts';
import { progress } from './support/fake-kvman.ts';

const chunk = (args?: Record<string, unknown>) => progress('@kvman/kvai', { type: 'toolcall', name: 'run', ...(args === undefined ? {} : { arguments: args }) } as never);

describe('the live view of a run call (08 §8.7, ADR 0011, 13)', () => {
  it('QA18-H20 the call shows its description as soon as it is complete, then its connector and command, and is whole once its payload is in', () => {
    const live = idleLive();
    applyEvent(live, chunk());
    expect(live.calls).toEqual([{ name: 'run', complete: false }]);
    applyEvent(live, chunk({ description: 'Editing app.ts.' }));
    expect(live.calls).toEqual([{ name: 'run', description: 'Editing app.ts.', complete: false }]);
    applyEvent(live, chunk({ description: 'Editing app.ts.', connector: 'fs', command: 'edit' }));
    expect(live.calls).toEqual([{ name: 'run', description: 'Editing app.ts.', label: 'fs · edit', complete: false }]);
    applyEvent(live, chunk({ description: 'Editing app.ts.', connector: 'fs', command: 'edit', payload: { path: 'src/app.ts' } }));
    expect(live.calls).toEqual([{ name: 'run', description: 'Editing app.ts.', label: 'fs · edit', complete: true }]);
  });

  it('QA8-E13 a toolcall chunk with payload null, too large to stream, still marks the call complete', () => {
    const live = idleLive();
    applyEvent(live, chunk());
    applyEvent(live, chunk({ description: 'Writes index.html.', connector: 'fs', command: 'write', payload: null }));
    expect(live.calls).toEqual([{ name: 'run', description: 'Writes index.html.', label: 'fs · write', complete: true }]);
  });
});
