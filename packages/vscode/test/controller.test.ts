import { describe, expect, it, vi } from 'vitest';
import { Controller, type Host } from '../src/controller.ts';
import type { ProcessHandlers } from '../src/kvman-process.ts';
import { Session, type View } from '../src/session.ts';

const runningLine = (port = 3737) => JSON.stringify({ kind: 'running', url: `http://127.0.0.1:${String(port)}/?workspace=w1`, port });

// A host that records what the controller asks of it; each started kvman is a run the test drives.
function world() {
  const views: View[] = [];
  const runs: { handlers: ProcessHandlers; written: string[]; closed: boolean }[] = [];
  const trust = { answer: true };
  const host: Host = {
    render: (view) => views.push(view),
    runVersion: () => Promise.resolve('0.4.7'),
    runInstall: () => Promise.resolve(0),
    startKvman: (handlers) => {
      const run = { handlers, written: [] as string[], closed: false };
      runs.push(run);
      return { write: (text) => run.written.push(text), closeInput: () => (run.closed = true) };
    },
    askTrust: () => Promise.resolve(trust.answer),
    isAlive: () => Promise.resolve(false),
    openExternal: vi.fn(),
    openLog: vi.fn(),
    openSettings: vi.fn(),
    sendToFrame: vi.fn(),
    setCanNew: vi.fn(),
    report: vi.fn(),
  };
  const controller = new Controller(new Session({ remote: false, extensionVersion: '0.4.7', windows: false }), host);
  const run = (index: number) => {
    const found = runs[index];
    if (found === undefined) throw new Error(`kvman was started ${String(runs.length)} times.`);
    return found;
  };
  return { controller, host, views, runs, run, trust };
}

describe('the controller (15 §15.3 to §15.5, ADR 0099)', () => {
  it('M4.2-H1 showing the view runs the version check, starts kvman, and shows its frame once', async () => {
    const { controller, views, run } = world();
    controller.happen({ kind: 'needed' });
    await vi.waitFor(() => expect(views.at(-1)).toEqual({ kind: 'starting' }));
    run(0).handlers.line(runningLine());
    expect(views.at(-1)).toEqual({ kind: 'frame', url: 'http://127.0.0.1:3737/?workspace=w1&embed=parent', port: 3737, start: 1 });
    controller.happen({ kind: 'needed' });
    run(0).handlers.line(JSON.stringify({ kind: 'restarting' }));
    expect(views.filter((view) => view.kind === 'frame')).toHaveLength(1);
  });

  it('M4.2-H8 a trust line asks the host, and its answer is written to kvman', async () => {
    const { controller, run, trust } = world();
    controller.happen({ kind: 'needed' });
    await vi.waitFor(() => run(0));
    const versions = [{ name: '@acme/a', version: '1.0.0', source: 'npm:1.0.0' }];
    run(0).handlers.line(JSON.stringify({ kind: 'trust', language: 'en', versions }));
    await vi.waitFor(() => expect(run(0).written).toEqual(['{"trust":true}']));
    trust.answer = false;
    run(0).handlers.line(JSON.stringify({ kind: 'trust', language: 'en', versions }));
    await vi.waitFor(() => expect(run(0).written).toEqual(['{"trust":true}', '{"trust":false}']));
  });

  it('M4.2-H14 an unreadable line closes the input and shows stopped; the window closing closes nothing more', async () => {
    const { controller, views, run } = world();
    controller.happen({ kind: 'needed' });
    await vi.waitFor(() => run(0));
    run(0).handlers.line('hello');
    expect(run(0).closed).toBe(true);
    expect(views.at(-1)).toEqual({ kind: 'stopped' });
  });

  it('M4.2-H11 closing the window that owns kvman closes its input', async () => {
    const { controller, run } = world();
    controller.happen({ kind: 'needed' });
    await vi.waitFor(() => run(0));
    run(0).handlers.line(runningLine());
    controller.happen({ kind: 'closing' });
    expect(run(0).closed).toBe(true);
  });

  it('M4.2-E5 lines and the end of an earlier run are ignored', async () => {
    const { controller, views, run, runs } = world();
    controller.happen({ kind: 'needed' });
    await vi.waitFor(() => run(0));
    run(0).handlers.exited();
    controller.happen({ kind: 'pressed', action: 'start' });
    expect(runs).toHaveLength(2);
    run(0).handlers.line(runningLine(4000));
    run(0).handlers.exited();
    expect(views.at(-1)).toEqual({ kind: 'starting' });
    run(1).handlers.line(runningLine());
    expect(views.at(-1)).toEqual({ kind: 'frame', url: 'http://127.0.0.1:3737/?workspace=w1&embed=parent', port: 3737, start: 2 });
  });

  it('M4.2-H12 a joined window that finds no kvman starts it again', async () => {
    const { controller, views, run, runs } = world();
    controller.happen({ kind: 'needed' });
    await vi.waitFor(() => run(0));
    run(0).handlers.line(JSON.stringify({ kind: 'joined', url: 'http://127.0.0.1:3737/?workspace=w1', port: 3737 }));
    run(0).handlers.exited();
    controller.happen({ kind: 'needed' });
    await vi.waitFor(() => expect(runs).toHaveLength(2));
    run(1).handlers.line(runningLine());
    expect(views.at(-1)?.kind).toBe('frame');
  });

  it('M4.2-H9 Show the log asks the host, and a host call that fails is reported', async () => {
    const { controller, host, run } = world();
    host.runVersion = () => Promise.reject(new Error('spawn failed'));
    controller.happen({ kind: 'needed' });
    await vi.waitFor(() => expect(host.report).toHaveBeenCalledWith(new Error('spawn failed')));
    controller.happen({ kind: 'pressed', action: 'start' });
    run(0).handlers.line(JSON.stringify({ kind: 'failed', problem: { code: 'INTERNAL', message: 'x' } }));
    controller.happen({ kind: 'pressed', action: 'showLog' });
    expect(host.openLog).toHaveBeenCalledTimes(1);
  });

  it('M4.6-H4 M4.6-H6 Settings, Pages, and inserted text reach the host once the frame said its workspace', async () => {
    const { controller, host, run } = world();
    controller.happen({ kind: 'needed' });
    await vi.waitFor(() => run(0));
    run(0).handlers.line(runningLine());
    controller.happen({ kind: 'insert', text: 'x' });
    expect(host.sendToFrame).not.toHaveBeenCalled();
    controller.happen({ kind: 'stated', workspaceId: 'w2' });
    controller.happen({ kind: 'pages' });
    controller.happen({ kind: 'needed', request: 'settings' });
    expect(vi.mocked(host.sendToFrame).mock.calls).toEqual([[{ kind: 'kvman.insert', text: 'x' }], [{ kind: 'kvman.pages' }]]);
    expect(vi.mocked(host.openSettings).mock.calls).toEqual([['http://127.0.0.1:3737/kvwebui/settings?workspace=w2&embed=parent']]);
  });
});
