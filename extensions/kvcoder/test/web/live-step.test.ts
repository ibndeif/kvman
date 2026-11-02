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
    expect(live.calls).toEqual([{ name: 'run', description: 'Editing app.ts.', label: 'fs · edit', connector: 'fs', command: 'edit', complete: false }]);
    applyEvent(live, chunk({ description: 'Editing app.ts.', connector: 'fs', command: 'edit', payload: { path: 'src/app.ts' } }));
    expect(live.calls).toEqual([{ name: 'run', description: 'Editing app.ts.', label: 'fs · edit', connector: 'fs', command: 'edit', complete: true }]);
  });

  it('QA8-E13 a toolcall chunk with payload null, too large to stream, still marks the call complete', () => {
    const live = idleLive();
    applyEvent(live, chunk());
    applyEvent(live, chunk({ description: 'Writes index.html.', connector: 'fs', command: 'write', payload: null }));
    expect(live.calls).toEqual([{ name: 'run', description: 'Writes index.html.', label: 'fs · write', connector: 'fs', command: 'write', complete: true }]);
  });

  const owners = (connector: string, command: string) => (connector === 'video' && command === 'compose' ? { owner: '@kvman/kvvideo', namespace: 'kvvideo' } : undefined);
  const fromExtension = (source: string, data: Record<string, unknown>) => ({ type: 'progress' as const, source, data: data as never });
  const runningCompose = () => {
    const live = idleLive();
    applyEvent(live, chunk());
    applyEvent(live, chunk({ connector: 'video', command: 'compose', payload: { file: 'a.mp4' } }));
    return live;
  };

  it("M5.9-H3 a running call shows its extension's newest progress", () => {
    const live = runningCompose();
    applyEvent(live, fromExtension('@kvman/kvvideo', { key: 'kvvideo.progress.scene', params: { n: 1, of: 3 } }), owners);
    applyEvent(live, fromExtension('@kvman/kvvideo', { key: 'kvvideo.progress.scene', params: { n: 2, of: 3 } }), owners);
    expect(live.calls[0]?.progress).toEqual({ key: 'kvvideo.progress.scene', params: { n: 2, of: 3 } });
    applyEvent(live, fromExtension('@kvman/kvvideo', { key: 'kvvideo.progress.final' }), owners);
    expect(live.calls[0]?.progress).toEqual({ key: 'kvvideo.progress.final', params: {} });
  });

  it('M5.9-E4 progress from another extension, outside its namespace, or of another shape is ignored', () => {
    const live = runningCompose();
    applyEvent(live, fromExtension('@kvman/kvbuilder', { key: 'kvvideo.progress.scene', params: { n: 1, of: 3 } }), owners);
    applyEvent(live, fromExtension('@kvman/kvvideo', { key: 'kvcoder.ui.running', params: {} }), owners);
    applyEvent(live, fromExtension('@kvman/kvvideo', { key: 'kvvideo.progress.scene', params: { n: { deep: 1 } } }), owners);
    applyEvent(live, fromExtension('@kvman/kvvideo', { text: 'Scene 1 of 3' }), owners);
    applyEvent(live, fromExtension('@kvman/kvvideo', { key: 'kvvideo.progress.scene', params: { n: 1, of: 3 } }));
    expect(live.calls[0]?.progress).toBeUndefined();
  });
});
