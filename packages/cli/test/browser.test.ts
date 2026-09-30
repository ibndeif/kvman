import { describe, expect, it } from 'vitest';
import { browserCommand } from '../src/browser.ts';

describe('opening the browser (01 §1.2)', () => {
  it('M1.8-E23 uses xdg-open on Linux, open on macOS, and cmd /c start "" on Windows', () => {
    const url = 'http://127.0.0.1:3737/?workspace=home';
    expect(browserCommand('linux', url)).toEqual({ command: 'xdg-open', args: [url] });
    expect(browserCommand('darwin', url)).toEqual({ command: 'open', args: [url] });
    expect(browserCommand('win32', url)).toEqual({ command: 'cmd', args: ['/c', 'start', '""', url] });
  });
});
