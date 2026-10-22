import { describe, expect, it } from 'vitest';
import type { Line } from '../src/lines.ts';
import { Session, type Effect, type Happening } from '../src/session.ts';

// What the person asks of the frame (15 §15.2, §15.4, and §15.6; ADR 0100, 22, 23, and 28).

const running = (port = 3737, workspace = 'w1'): Line => ({ kind: 'running', url: `http://127.0.0.1:${String(port)}/?workspace=${workspace}`, port });

function framed() {
  const made = new Session({ remote: false, extensionVersion: '0.4.7', windows: false });
  const steps = (...happenings: Happening[]): Effect[] => happenings.flatMap((happening) => made.handle(happening));
  steps({ kind: 'needed' }, { kind: 'versionAnswered', output: '0.4.7' }, { kind: 'line', line: running() });
  return { made, steps };
}

const insert = (text: string): Effect => ({ kind: 'sendToFrame', message: { kind: 'kvman.insert', text } });

describe("the frame's requests (15 §15.4 to §15.6, ADR 0100)", () => {
  it("M4.6-H4 Pages, Open in browser, and Settings use the frame's workspace", () => {
    const { steps } = framed();
    expect(steps({ kind: 'pages' })).toEqual([]);
    expect(steps({ kind: 'stated', workspaceId: 'w2' })).toEqual([]);
    expect(steps({ kind: 'pages' })).toEqual([{ kind: 'sendToFrame', message: { kind: 'kvman.pages' } }]);
    expect(steps({ kind: 'needed', request: 'browser' })).toEqual([{ kind: 'openExternal', url: 'http://127.0.0.1:3737/?workspace=w2' }]);
    expect(steps({ kind: 'needed', request: 'settings' })).toEqual([{ kind: 'openSettings', url: 'http://127.0.0.1:3737/kvwebui/settings?workspace=w2&embed=parent' }]);
  });

  it('M4.6-H6 inserted text waits for the frame to say its workspace, then goes to it; later text goes at once', () => {
    const { steps } = framed();
    expect(steps({ kind: 'insert', text: 'first' })).toEqual([]);
    expect(steps({ kind: 'stated', workspaceId: 'w1' })).toEqual([insert('first')]);
    expect(steps({ kind: 'insert', text: 'second' })).toEqual([insert('second')]);
  });

  it('M4.6-H6 inserted text before kvman runs starts it, and is sent once the frame says its workspace', () => {
    const made = new Session({ remote: false, extensionVersion: '0.4.7', windows: false });
    expect(made.handle({ kind: 'insert', text: 'early' })).toEqual([{ kind: 'checkVersion' }]);
    expect(made.handle({ kind: 'versionAnswered', output: '0.4.7' })).toEqual([{ kind: 'start' }]);
    expect(made.handle({ kind: 'line', line: running() })).toEqual([]);
    expect(made.handle({ kind: 'stated', workspaceId: 'w1' })).toEqual([insert('early')]);
  });

  it('M4.6-E3 a new frame after a restart waits for its own state', () => {
    const { steps } = framed();
    steps({ kind: 'stated', workspaceId: 'w1' });
    steps({ kind: 'line', line: { kind: 'restarting' } }, { kind: 'line', line: running(3800) });
    expect(steps({ kind: 'insert', text: 'held' })).toEqual([]);
    expect(steps({ kind: 'stated', workspaceId: 'w1' })).toEqual([insert('held')]);
    expect(steps({ kind: 'needed', request: 'browser' })).toEqual([{ kind: 'openExternal', url: 'http://127.0.0.1:3800/?workspace=w1' }]);
  });

  it('M4.6-E4 Settings with no kvman starts it, and opens at the start workspace once kvman runs; Pages sends nothing', () => {
    const made = new Session({ remote: false, extensionVersion: '0.4.7', windows: false });
    expect(made.handle({ kind: 'pages' })).toEqual([]);
    expect(made.handle({ kind: 'needed', request: 'settings' })).toEqual([{ kind: 'checkVersion' }]);
    made.handle({ kind: 'versionAnswered', output: '0.4.7' });
    expect(made.handle({ kind: 'line', line: running(3737, 'home') })).toEqual([{ kind: 'openSettings', url: 'http://127.0.0.1:3737/kvwebui/settings?workspace=home&embed=parent' }]);
  });

  it('M4.6-E3 a kvman that stopped takes no inserted text until a new frame says its workspace', () => {
    const { steps } = framed();
    steps({ kind: 'stated', workspaceId: 'w1' }, { kind: 'exited' });
    expect(steps({ kind: 'insert', text: 'later' })).toEqual([]);
    expect(steps({ kind: 'pressed', action: 'start' }, { kind: 'line', line: running() }, { kind: 'stated', workspaceId: 'w1' })).toEqual([{ kind: 'start' }, insert('later')]);
  });
});
