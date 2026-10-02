import { describe, expect, it } from 'vitest';
import { applyEvent, idleLive } from '../../web/src/live-step.ts';
import { progress } from './support/fake-kvman.ts';

describe('the live view of a call whose command was too large to stream (08 §8.7, ADR 0009, 189)', () => {
  it('QA8-E13 a toolcall chunk with command null still marks the call complete, with its title and description', () => {
    const live = idleLive();
    applyEvent(live, progress('@kvman/kvai', { type: 'toolcall', name: 'bash' }));
    applyEvent(live, progress('@kvman/kvai', { type: 'toolcall', name: 'bash', arguments: { title: 'Write the page', description: 'Writes index.html.', command: null } }));
    expect(live.calls).toEqual([{ name: 'bash', title: 'Write the page', description: 'Writes index.html.', complete: true }]);
  });
});
