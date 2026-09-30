import { spawn } from 'node:child_process';

// Opening the URL in the browser (plan 01 §1.2): `xdg-open` on Linux, `open` on macOS, `cmd /c start ""` on Windows.
// A command that fails is reported to `failed`, and kvman keeps running (ADR 0009, 50).

export type BrowserCommand = { command: string; args: string[] };

export function browserCommand(platform: NodeJS.Platform, url: string): BrowserCommand {
  if (platform === 'darwin') return { command: 'open', args: [url] };
  if (platform === 'win32') return { command: 'cmd', args: ['/c', 'start', '""', url] };
  return { command: 'xdg-open', args: [url] };
}

export function openBrowser(platform: NodeJS.Platform, url: string, failed: (reason: string) => void): void {
  const { command, args } = browserCommand(platform, url);
  const child = spawn(command, args, { stdio: 'ignore', windowsHide: true, windowsVerbatimArguments: platform === 'win32' });
  child.once('error', (error) => failed(error.message));
  child.once('exit', (code) => {
    if (code !== 0) failed(`${command} exited with code ${String(code)}`);
  });
}
