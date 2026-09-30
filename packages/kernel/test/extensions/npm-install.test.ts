import { describe, expect, it } from 'vitest';
import { npmInstallCommand } from '../../src/extensions/npm-install.ts';

describe('the npm install command (02 §2.9, ADR 0009, 47)', () => {
  it('M1.8-E25 runs npm directly on Linux and macOS, and through cmd.exe on Windows', () => {
    const args = ['install', '--ignore-scripts', '--omit=dev', '--legacy-peer-deps', '--prefix', '.', '@acme/hello@1.0.0'];
    expect(npmInstallCommand('linux', '@acme/hello@1.0.0')).toEqual({ command: 'npm', args });
    expect(npmInstallCommand('darwin', '@acme/hello@1.0.0')).toEqual({ command: 'npm', args });
    expect(npmInstallCommand('win32', '@acme/hello@1.0.0')).toEqual({ command: 'cmd.exe', args: ['/d', '/s', '/c', 'npm', ...args] });
  });
});
