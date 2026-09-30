import { describe, expect, it } from 'vitest';
import type { Caller, File } from '@kvman/sdk';
import { mayUnlink } from '../../src/files/file-access.ts';

const user: Caller = { kind: 'user' };
const owner: Caller = { kind: 'extension', name: '@test/a' };
const other: Caller = { kind: 'extension', name: '@test/b' };
const kernel: Caller = { kind: 'kernel' };

describe('who may unlink a file (02 §2.7)', () => {
  it('M1.6-E13 the owner may, and anyone may unlink a user upload; nobody else', () => {
    const extensionFile: File['owner'] = { kind: 'extension', name: '@test/a' };
    const upload: File['owner'] = { kind: 'user' };
    expect([owner, other, user, kernel].map((caller) => mayUnlink(extensionFile, caller))).toEqual([true, false, false, false]);
    expect([owner, other, user, kernel].map((caller) => mayUnlink(upload, caller))).toEqual([true, true, true, false]);
  });
});
