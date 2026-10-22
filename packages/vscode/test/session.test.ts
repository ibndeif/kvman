import { describe, expect, it } from 'vitest';
import type { Line } from '../src/lines.ts';
import { Session, type Effect, type Happening } from '../src/session.ts';

const running = (port = 3737, workspace = 'w1'): Line => ({ kind: 'running', url: `http://127.0.0.1:${String(port)}/?workspace=${workspace}`, port });
const joined: Line = { kind: 'joined', url: 'http://127.0.0.1:3737/?workspace=w1', port: 3737 };
const failed = (code: string): Line => ({ kind: 'failed', language: 'en', problem: { code, message: `the ${code} message` } });

function session(options: Partial<{ remote: boolean; extensionVersion: string; windows: boolean }> = {}) {
  const made = new Session({ remote: false, extensionVersion: '0.4.7', windows: false, ...options });
  const steps = (...happenings: Happening[]): Effect[] => happenings.flatMap((happening) => made.handle(happening));
  return { made, steps };
}

// A session that has checked the version and started kvman once.
function started(options: Parameters<typeof session>[0] = {}) {
  const world = session(options);
  world.steps({ kind: 'needed' }, { kind: 'versionAnswered', output: '0.4.7\n' });
  return world;
}

describe('the session (15 §15.3 to §15.5, ADR 0099)', () => {
  it('M4.2-H1 M4.6-H2 showing the view checks the version, starts kvman, and frames its URL with embed=parent', () => {
    const { made, steps } = session();
    expect(steps({ kind: 'needed' })).toEqual([{ kind: 'checkVersion' }]);
    expect(made.view).toEqual({ kind: 'starting' });
    expect(steps({ kind: 'versionAnswered', output: '0.4.7\n' })).toEqual([{ kind: 'start' }]);
    expect(steps({ kind: 'line', line: running() })).toEqual([]);
    expect(made.view).toEqual({ kind: 'frame', url: 'http://127.0.0.1:3737/?workspace=w1&embed=parent', port: 3737 });
    expect(made.owner).toBe(true);
    expect(steps({ kind: 'needed' })).toEqual([]);
  });

  it('M4.2-H3 a remote window shows the local-only view and does nothing', () => {
    const { made, steps } = session({ remote: true });
    expect(steps({ kind: 'needed' }, { kind: 'needed', request: 'browser' }, { kind: 'pressed', action: 'install' })).toEqual([]);
    expect(made.view).toEqual({ kind: 'remote' });
  });

  it('M4.2-H4 no kvman: the view offers the install, which runs the task, and code 0 starts kvman', () => {
    const { made, steps } = session();
    steps({ kind: 'needed' }, { kind: 'versionAnswered', output: undefined });
    expect(made.view).toEqual({ kind: 'missing' });
    expect(steps({ kind: 'pressed', action: 'install' })).toEqual([{ kind: 'install', update: false }]);
    expect(made.view).toEqual({ kind: 'installing' });
    expect(steps({ kind: 'installEnded', code: 0 })).toEqual([{ kind: 'start' }]);
    expect(made.view).toEqual({ kind: 'starting' });
  });

  it('M4.2-H5 an install that ends 127 on Linux or 9009 on Windows means no npm; another code a failed install', () => {
    const linux = session();
    linux.steps({ kind: 'pressed', action: 'update' }, { kind: 'installEnded', code: 127 });
    expect(linux.made.view).toEqual({ kind: 'npmMissing', update: true });
    const windows = session({ windows: true });
    windows.steps({ kind: 'pressed', action: 'install' }, { kind: 'installEnded', code: 9009 });
    expect(windows.made.view).toEqual({ kind: 'npmMissing', update: false });
    windows.steps({ kind: 'pressed', action: 'install' }, { kind: 'installEnded', code: 127 });
    expect(windows.made.view).toEqual({ kind: 'installFailed', update: false });
    linux.steps({ kind: 'pressed', action: 'install' }, { kind: 'installEnded', code: 1 });
    expect(linux.made.view).toEqual({ kind: 'installFailed', update: false });
    linux.steps({ kind: 'installEnded', code: undefined });
    expect(linux.made.view).toEqual({ kind: 'installFailed', update: false });
    expect(linux.steps({ kind: 'pressed', action: 'nodejs' })).toEqual([{ kind: 'openExternal', url: 'https://nodejs.org' }]);
  });

  it('M4.2-H6 a kvman older than the minimum is not started, and Update installs kvman@latest', () => {
    const { made, steps } = session();
    expect(steps({ kind: 'needed' }, { kind: 'versionAnswered', output: '0.3.9' })).toEqual([{ kind: 'checkVersion' }]);
    expect(made.view).toEqual({ kind: 'tooOld', version: '0.3.9', minimum: '0.4.7' });
    expect(steps({ kind: 'pressed', action: 'update' })).toEqual([{ kind: 'install', update: true }]);
  });

  it('M4.2-H8 a trust line asks with its versions, and each answer is written as a line', () => {
    const { steps } = started();
    const versions = [{ name: '@acme/a', version: '1.0.0', source: 'npm:1.0.0' }, { name: 'tool', version: '0.1.0', source: 'path:/dev/tool' }];
    expect(steps({ kind: 'line', line: { kind: 'trust', language: 'en', versions } })).toEqual([{ kind: 'askTrust', versions }]);
    expect(steps({ kind: 'trustAnswered', accepted: true })).toEqual([{ kind: 'write', text: '{"trust":true}' }]);
    expect(steps({ kind: 'trustAnswered', accepted: false })).toEqual([{ kind: 'write', text: '{"trust":false}' }]);
  });

  it('M4.2-H9 a failed line shows its Problem; Show the log and Try again act', () => {
    const { made, steps } = started();
    steps({ kind: 'line', line: failed('PORT_IN_USE') }, { kind: 'exited' });
    expect(made.view).toEqual({ kind: 'failed', problem: { code: 'PORT_IN_USE', message: 'the PORT_IN_USE message' } });
    expect(made.owner).toBe(false);
    expect(steps({ kind: 'pressed', action: 'showLog' })).toEqual([{ kind: 'openLog' }]);
    expect(steps({ kind: 'pressed', action: 'start' })).toEqual([{ kind: 'start' }]);
    expect(made.view).toEqual({ kind: 'starting' });
  });

  it('M4.2-H10 a joined line frames kvman without owning it, and its exit and the window closing change nothing', () => {
    const { made, steps } = started();
    steps({ kind: 'line', line: joined });
    expect(made.view).toEqual({ kind: 'frame', url: 'http://127.0.0.1:3737/?workspace=w1&embed=parent', port: 3737 });
    expect(made.owner).toBe(false);
    expect(steps({ kind: 'exited' }, { kind: 'closing' })).toEqual([]);
    expect(made.view.kind).toBe('frame');
  });

  it('M4.2-H11 closing the window that owns kvman closes its input', () => {
    const { steps } = started();
    steps({ kind: 'line', line: running() });
    expect(steps({ kind: 'closing' })).toEqual([{ kind: 'closeInput' }]);
  });

  it('M4.2-H12 a window that joined checks kvman when shown again, and starts it when nobody answers', () => {
    const { made, steps } = started();
    steps({ kind: 'line', line: joined }, { kind: 'exited' });
    expect(steps({ kind: 'needed' })).toEqual([{ kind: 'checkHealth', port: 3737 }]);
    expect(steps({ kind: 'healthAnswered', alive: true })).toEqual([]);
    expect(made.view.kind).toBe('frame');
    expect(steps({ kind: 'needed' }, { kind: 'healthAnswered', alive: false })).toEqual([{ kind: 'checkHealth', port: 3737 }, { kind: 'start' }]);
    steps({ kind: 'line', line: running() });
    expect(made.owner).toBe(true);
  });

  it('M4.2-H13 restarting changes nothing, and a running line on another port moves the frame', () => {
    const { made, steps } = started();
    steps({ kind: 'line', line: running() });
    expect(steps({ kind: 'line', line: { kind: 'restarting' } })).toEqual([]);
    expect(made.view).toEqual({ kind: 'frame', url: 'http://127.0.0.1:3737/?workspace=w1&embed=parent', port: 3737 });
    steps({ kind: 'line', line: running(3800) });
    expect(made.view).toEqual({ kind: 'frame', url: 'http://127.0.0.1:3800/?workspace=w1&embed=parent', port: 3800 });
  });

  it('M4.2-H14 a kvman that ends by itself, or an unreadable line, shows stopped; Start again starts it', () => {
    const ended = started();
    ended.steps({ kind: 'line', line: running() });
    expect(ended.steps({ kind: 'exited' })).toEqual([]);
    expect(ended.made.view).toEqual({ kind: 'stopped' });
    expect(ended.made.owner).toBe(false);
    expect(ended.steps({ kind: 'pressed', action: 'start' })).toEqual([{ kind: 'start' }]);

    const unreadable = started();
    expect(unreadable.steps({ kind: 'unreadable' })).toEqual([{ kind: 'closeInput' }]);
    expect(unreadable.made.view).toEqual({ kind: 'stopped' });
    const starting = started();
    starting.steps({ kind: 'exited' });
    expect(starting.made.view).toEqual({ kind: 'stopped' });
  });

  it('M4.2-H19 Open in browser starts kvman first, opens the start workspace once it runs, then at once', () => {
    const { steps } = session();
    expect(steps({ kind: 'needed', request: 'browser' })).toEqual([{ kind: 'checkVersion' }]);
    steps({ kind: 'versionAnswered', output: '0.4.7' });
    expect(steps({ kind: 'line', line: running() })).toEqual([{ kind: 'openExternal', url: 'http://127.0.0.1:3737/?workspace=w1' }]);
    expect(steps({ kind: 'needed', request: 'browser' })).toEqual([{ kind: 'openExternal', url: 'http://127.0.0.1:3737/?workspace=w1' }]);
    expect(steps({ kind: 'needed' })).toEqual([]);
  });

  it('M4.2-H19 a joined window opens the browser once kvman answers, and a stopped one starts kvman first', () => {
    const joinedWorld = started();
    joinedWorld.steps({ kind: 'line', line: joined });
    expect(joinedWorld.steps({ kind: 'needed', request: 'browser' }, { kind: 'healthAnswered', alive: true })).toEqual([{ kind: 'checkHealth', port: 3737 }, { kind: 'openExternal', url: 'http://127.0.0.1:3737/?workspace=w1' }]);
    const stopped = started();
    stopped.steps({ kind: 'line', line: running() }, { kind: 'exited' });
    expect(stopped.steps({ kind: 'needed', request: 'browser' })).toEqual([{ kind: 'start' }]);
    expect(stopped.steps({ kind: 'line', line: running() })).toEqual([{ kind: 'openExternal', url: 'http://127.0.0.1:3737/?workspace=w1' }]);
  });

  it('M4.2-E1 the version is checked before the first start in a window only', () => {
    const { steps } = started();
    steps({ kind: 'line', line: running() }, { kind: 'exited' });
    expect(steps({ kind: 'pressed', action: 'start' })).toEqual([{ kind: 'start' }]);
    steps({ kind: 'exited' });
    expect(steps({ kind: 'needed' })).toEqual([]);
  });
});
