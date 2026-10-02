import { describe, expect, it } from 'vitest';
import { frameableUrl } from '../../web/src/artifact-url.ts';

const own = { protocol: 'http:', port: '3737' };

describe('the address a url artifact may frame (08 §8.7, ADR 0009, 216)', () => {
  it('QA12-E3 a local page is framed, and kvman itself, other hosts, other schemes, and credentials are not', () => {
    expect(frameableUrl('http://localhost:8080/', own)).toBe('http://localhost:8080/');
    expect(frameableUrl('  https://127.0.0.1:5173/app?x=1 ', own)).toBe('https://127.0.0.1:5173/app?x=1');
    expect(frameableUrl('http://localhost/', own)).toBe('http://localhost/');
    for (const address of ['http://localhost:3737/', 'http://127.0.0.1:3737/api', 'http://localhost:3737', 'https://example.com', 'http://192.168.1.5:3000', 'ftp://localhost/', 'javascript:alert(1)', 'http://user:pw@localhost:8080/', 'http://localhost:8080 extra', '', 'not a url']) {
      expect(frameableUrl(address, own), address).toBeUndefined();
    }
  });

  it('QA12-E3 the default port counts: kvman on port 80 is not framed through a bare address', () => {
    expect(frameableUrl('http://localhost/', { protocol: 'http:', port: '' })).toBeUndefined();
    expect(frameableUrl('http://localhost:8080/', { protocol: 'http:', port: '' })).toBe('http://localhost:8080/');
    expect(frameableUrl('http://localhost/', { protocol: 'http:', port: '80' })).toBeUndefined();
    expect(frameableUrl('https://localhost/', { protocol: 'https:', port: '443' })).toBeUndefined();
  });
});
