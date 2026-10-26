import { describe, expect, it } from 'vitest';
import type { Line } from '../src/lines.ts';
import { Session, type Effect, type Happening } from '../src/session.ts';

// A joined kvman's version (15 §15.3, step 5, ADR 0106, 5): the extension asks it before framing it.

const joined: Line = { kind: 'joined', url: 'http://127.0.0.1:3737/?workspace=w1', port: 3737 };
const frame = { kind: 'frame', url: 'http://127.0.0.1:3737/?workspace=w1&embed=parent', port: 3737, start: 1 };

// A session of an extension at 0.4.8 that has checked the version and started kvman once.
function started(extensionVersion = '0.4.8') {
  const made = new Session({ remote: false, extensionVersion, windows: false });
  const steps = (...happenings: Happening[]): Effect[] => happenings.flatMap((happening) => made.handle(happening));
  steps({ kind: 'needed' }, { kind: 'versionAnswered', output: `${extensionVersion}\n` });
  return { made, steps };
}

describe("a joined kvman's version (15 §15.3, ADR 0106, 5)", () => {
  it('M4.8-H2 a joined kvman older than the extension shows the older-kvman view, not owned', () => {
    const { made, steps } = started();
    expect(steps({ kind: 'line', line: joined })).toEqual([{ kind: 'checkJoined', port: 3737, start: 1 }]);
    expect(made.view).toEqual({ kind: 'starting' });
    expect(steps({ kind: 'joinedAnswered', start: 1, version: '0.4.6' })).toEqual([]);
    expect(made.view).toEqual({ kind: 'oldRunning', version: '0.4.6', minimum: '0.4.8' });
    expect(made.owner).toBe(false);
  });

  it('M4.8-H3 Start again starts kvman, and Open anyway frames the joined kvman with what waited', () => {
    const again = started();
    again.steps({ kind: 'line', line: joined }, { kind: 'joinedAnswered', start: 1, version: '0.4.6' });
    expect(again.steps({ kind: 'pressed', action: 'start' })).toEqual([{ kind: 'start' }]);
    expect(again.made.view).toEqual({ kind: 'starting' });
    const anyway = started();
    anyway.steps({ kind: 'line', line: joined }, { kind: 'joinedAnswered', start: 1, version: '0.4.6' });
    expect(anyway.steps({ kind: 'needed', request: 'browser' })).toEqual([]);
    expect(anyway.steps({ kind: 'pressed', action: 'openAnyway' })).toEqual([{ kind: 'openExternal', url: 'http://127.0.0.1:3737/?workspace=w1' }]);
    expect(anyway.made.view).toEqual(frame);
    expect(anyway.made.owner).toBe(false);
    expect(anyway.steps({ kind: 'pressed', action: 'openAnyway' })).toEqual([]);
  });

  it('M4.8-H4 a joined kvman as new as the extension is framed at once', () => {
    const { made, steps } = started();
    steps({ kind: 'line', line: joined }, { kind: 'joinedAnswered', start: 1, version: '0.4.8' });
    expect(made.view).toEqual(frame);
    expect(made.owner).toBe(false);
  });

  it("M4.8-E1 a joined kvman that doesn't answer, or answers without a version, is framed", () => {
    const { made, steps } = started();
    steps({ kind: 'line', line: joined }, { kind: 'joinedAnswered', start: 1, version: undefined });
    expect(made.view).toEqual(frame);
  });

  it("M4.8-E2 the joined start's exit during the check changes nothing, and a stale answer is ignored", () => {
    const { made, steps } = started();
    steps({ kind: 'line', line: joined });
    expect(steps({ kind: 'exited' })).toEqual([]);
    expect(made.view).toEqual({ kind: 'starting' });
    steps({ kind: 'joinedAnswered', start: 1, version: '0.4.8' });
    expect(made.view).toEqual(frame);
    const restarted = started();
    restarted.steps({ kind: 'line', line: joined }, { kind: 'joinedAnswered', start: 1, version: '0.4.6' }, { kind: 'pressed', action: 'start' });
    expect(restarted.steps({ kind: 'joinedAnswered', start: 1, version: '0.4.8' })).toEqual([]);
    expect(restarted.made.view).toEqual({ kind: 'starting' });
  });

  it('M4.8-E3 a request made during the check waits for the frame', () => {
    const { steps } = started();
    steps({ kind: 'line', line: joined });
    expect(steps({ kind: 'needed', request: 'browser' })).toEqual([]);
    expect(steps({ kind: 'joinedAnswered', start: 1, version: '0.4.8' })).toEqual([{ kind: 'openExternal', url: 'http://127.0.0.1:3737/?workspace=w1' }]);
  });
});
