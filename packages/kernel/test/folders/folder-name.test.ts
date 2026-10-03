import { describe, expect, it } from 'vitest';
import { folderNameProblem } from '../../src/kernel-api/folder-name.ts';

describe('a folder name (02 §2.12, ADR 0009, 222)', () => {
  it('QA14-E3 Windows refuses more than the other systems, and each system has its own rules', () => {
    const windowsOnly = ['a:b', 'a*', 'a?b', 'a<b', 'a>b', 'a"b', 'a|b', 'con', 'CON', 'NUL.txt', 'LPT1', 'com9.log', 'x.', 'x ', 'tab\there'];
    for (const name of windowsOnly) {
      expect(folderNameProblem(name, 'win32'), `win32 ${name}`).toEqual(expect.any(String));
      expect(folderNameProblem(name, 'linux'), `linux ${name}`).toBeUndefined();
      expect(folderNameProblem(name, 'darwin'), `darwin ${name}`).toBeUndefined();
    }
    for (const name of ['console', 'a.b', 'Ünï', 'com10', 'lpt0', 'my project', '.hidden']) {
      for (const platform of ['win32', 'linux', 'darwin'] as const) expect(folderNameProblem(name, platform), `${platform} ${name}`).toBeUndefined();
    }
  });

  it('QA14-E1 on every system an empty name, a separator, a dot name, a NUL, and a name over 255 characters are refused', () => {
    for (const platform of ['win32', 'linux', 'darwin'] as const) {
      for (const name of ['', '   ', 'a/b', 'a\\b', '.', '..', 'a\u0000b', 'x'.repeat(256)]) expect(folderNameProblem(name, platform), `${platform} ${JSON.stringify(name).slice(0, 20)}`).toEqual(expect.any(String));
      expect(folderNameProblem('x'.repeat(255), platform), platform).toBeUndefined();
    }
  });
});
