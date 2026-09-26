import { describe, expect, it } from 'vitest';
import {
  blobInfoSchema, blobNameSchema, blobStatSchema, fileEntrySchema, fileStatSchema, hostUnitOfWorkSchema, mimeTypeSchema, rpcCallSchema, trustChangedSchema,
  trustGrantRequestSchema, trustPreviewRequestSchema, trustPreviewResultSchema, trustRevokeRequestSchema,
} from '../src/index.ts';
import { expectRoundTrip } from './assertions.ts';

const workspaceId = 'a'.repeat(64);
const blobId = 'b'.repeat(64);

type Parser = { safeParse(value: unknown): { success: boolean } };

describe('blobs, workspace files, and trust (plan 04 §4.6, 07 §7.2, ADRs 0134–0138)', () => {
  it('M2.5-E37 the new shapes are strict', () => {
    expectRoundTrip(trustPreviewRequestSchema, { workspaceId });
    expectRoundTrip(trustPreviewResultSchema, { files: [{ path: '.kvman/rules/a.md', sha256: blobId }], confirmationToken: 'token' });
    expectRoundTrip(trustGrantRequestSchema, { confirmationToken: 'token', mode: 'once' });
    expectRoundTrip(trustRevokeRequestSchema, { workspaceId });
    expectRoundTrip(trustChangedSchema, { workspaceId, trusted: false });
    expectRoundTrip(blobInfoSchema, { blobId, size: 3, mime: 'image/svg+xml', name: 'ملف.txt' });
    expectRoundTrip(blobStatSchema, { size: 0, mime: 'application/octet-stream' });
    expectRoundTrip(fileEntrySchema, { name: 'a.md', kind: 'symlink', size: 4 });
    expectRoundTrip(fileStatSchema, { kind: 'directory', size: 0, modifiedAt: 1 });
    const calls = [
      { name: 'blobs.put.open' },
      { name: 'blobs.put.write', upload: 1, bytes: 'aGk=' },
      { name: 'blobs.put.close', upload: 1, scope: 'workspace', mime: 'text/plain', fileName: 'a.txt' },
      { name: 'blobs.put.file', path: 'data/b.bin', scope: 'global' },
      { name: 'blobs.stat', blobId },
      { name: 'blobs.read', blobId, offset: 0, length: 1048576 },
      { name: 'workspace.read', path: 'a.md' },
      { name: 'workspace.write', path: 'a.md', content: { text: 'x' } },
      { name: 'workspace.write', path: 'b.bin', content: { base64: 'AA==' } },
      { name: 'workspace.list', path: '.' },
      { name: 'workspace.stat', path: 'a.md' },
      { name: 'workspace.mkdir', path: 'notes' },
      { name: 'workspace.rm', path: 'notes', recursive: true },
      { name: 'workspace.glob', pattern: '**/*.md' },
    ];
    for (const call of calls) expectRoundTrip(rpcCallSchema, call);
    const unit = { writes: [], sends: [], publishes: [], replies: [], config: [], secrets: [], blobRefs: [{ blobId, scope: 'workspace', op: 'release' }] };
    expectRoundTrip(hostUnitOfWorkSchema, unit);
    const invalid: Array<[Parser, unknown]> = [
      [trustGrantRequestSchema, { confirmationToken: 'token', mode: 'forever' }],
      [trustPreviewResultSchema, { files: [{ path: 'a', sha256: 'x' }], confirmationToken: 'token' }],
      [trustChangedSchema, { workspaceId, trusted: true, reason: 'x' }],
      [mimeTypeSchema, 'text/plain; charset=utf-8'],
      [mimeTypeSchema, 'Text/Plain'],
      [blobNameSchema, 'a/b.txt'],
      [blobNameSchema, 'a\u0000'],
      [blobNameSchema, 'x'.repeat(256)],
      [rpcCallSchema, { name: 'blobs.read', blobId, offset: 0, length: 1048577 }],
      [rpcCallSchema, { name: 'blobs.put.close', upload: 1, scope: 'workspace', filename: 'a.txt' }],
      [rpcCallSchema, { name: 'blobs.put.write', upload: 1, bytes: 'not base64!' }],
      [rpcCallSchema, { name: 'workspace.rm', path: 'notes' }],
      [rpcCallSchema, { name: 'workspace.write', path: 'a', content: { text: 'x', base64: 'AA==' } }],
      [hostUnitOfWorkSchema, { ...unit, blobRefs: [{ blobId, scope: 'workspace', op: 'drop' }] }],
      [hostUnitOfWorkSchema, { ...unit, blobRefs: [{ blobId, scope: 'workspace', op: 'keep', owner: '@acme/other' }] }],
    ];
    for (const [schema, value] of invalid) expect(schema.safeParse(value).success, JSON.stringify(value)).toBe(false);
  });
});
