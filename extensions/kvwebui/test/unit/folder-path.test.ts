import { describe, expect, it } from 'vitest';
import { pathSegments } from '../../web/src/state/folder-path.ts';

describe('the segments of a folder path (06 §6.2, ADR 0009, 224)', () => {
  it('QA14-H7 a POSIX path gives the root, then each folder with the path that goes to it', () => {
    expect(pathSegments('/home/me')).toEqual([{ name: '/', path: '/' }, { name: 'home', path: '/home' }, { name: 'me', path: '/home/me' }]);
    expect(pathSegments('/')).toEqual([{ name: '/', path: '/' }]);
  });

  it('QA14-E12 a drive path, a drive path with slashes, and a network share are read from their own root', () => {
    expect(pathSegments('C:\\Users\\me')).toEqual([{ name: 'C:\\', path: 'C:\\' }, { name: 'Users', path: 'C:\\Users' }, { name: 'me', path: 'C:\\Users\\me' }]);
    expect(pathSegments('C:\\')).toEqual([{ name: 'C:\\', path: 'C:\\' }]);
    expect(pathSegments('D:/work/app')).toEqual([{ name: 'D:/', path: 'D:/' }, { name: 'work', path: 'D:/work' }, { name: 'app', path: 'D:/work/app' }]);
    expect(pathSegments('\\\\server\\share\\dir\\sub')).toEqual([{ name: '\\\\server\\share', path: '\\\\server\\share' }, { name: 'dir', path: '\\\\server\\share\\dir' }, { name: 'sub', path: '\\\\server\\share\\dir\\sub' }]);
  });
});
