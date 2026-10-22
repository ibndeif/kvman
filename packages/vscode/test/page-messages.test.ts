import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { readPageMessage } from '../src/page-messages.ts';

describe("the view page's messages (15 §15.4, ADR 0099, 23)", () => {
  it('M4.2-H15 a new window from the frame and a button press are read', () => {
    expect(readPageMessage({ from: 'frame', data: { kind: 'kvman.open', url: 'https://auth.example/x?a=1' } })).toEqual({ kind: 'open', url: 'https://auth.example/x?a=1' });
    expect(readPageMessage({ from: 'frame', data: { kind: 'kvman.open', url: 'http://127.0.0.1:5173/' } })).toEqual({ kind: 'open', url: 'http://127.0.0.1:5173/' });
    expect(readPageMessage({ from: 'page', action: 'install' })).toEqual({ kind: 'pressed', action: 'install' });
  });

  it('M4.2-E4 another scheme, another shape, or a button from the frame is dropped', () => {
    for (const url of ['file:///etc/passwd', 'javascript:alert(1)', 'vscode://settings', 'not an address']) {
      expect(readPageMessage({ from: 'frame', data: { kind: 'kvman.open', url } }), url).toBeUndefined();
    }
    for (const message of [{ kind: 'kvman.open', url: 'https://a.example' }, { from: 'frame', data: { kind: 'other' } }, { from: 'frame', action: 'install' }, { from: 'page', action: 'delete' }, 'x', null]) {
      expect(readPageMessage(message), JSON.stringify(message)).toBeUndefined();
    }
  });

  it("M4.6-H5 the frame's workspace and its opens of a file, a diff, and a Git change are read", () => {
    const frame = (data: unknown) => readPageMessage({ from: 'frame', data });
    const file = path.resolve('/w/a.ts');
    expect(frame({ kind: 'kvman.state', workspaceId: 'w1' })).toEqual({ kind: 'stated', workspaceId: 'w1' });
    expect(frame({ kind: 'kvman.openFile', path: file, line: 12 })).toEqual({ kind: 'openFile', path: file, line: 12 });
    expect(frame({ kind: 'kvman.openFile', path: file })).toEqual({ kind: 'openFile', path: file });
    expect(frame({ kind: 'kvman.openDiff', title: 'a.ts (proposed)', path: file, after: 'x' })).toEqual({ kind: 'openDiff', title: 'a.ts (proposed)', path: file, after: 'x' });
    expect(frame({ kind: 'kvman.openChange', path: file })).toEqual({ kind: 'openChange', path: file });
  });

  it('M4.6-E1 a relative path, a missing field, or a wrong type opens nothing', () => {
    const frame = (data: unknown) => readPageMessage({ from: 'frame', data });
    const file = path.resolve('/w/a.ts');
    for (const data of [
      { kind: 'kvman.openFile', path: 'src/a.ts' },
      { kind: 'kvman.openFile', path: file, line: 0 },
      { kind: 'kvman.openDiff', title: 'a', path: file },
      { kind: 'kvman.openChange', path: 5 },
      { kind: 'kvman.state' },
      { kind: 'kvman.state', workspaceId: '' },
    ]) {
      expect(frame(data), JSON.stringify(data)).toBeUndefined();
    }
  });
});
