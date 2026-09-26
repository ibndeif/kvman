import { mkdirSync, readFileSync, rmSync, symlinkSync, unlinkSync, utimesSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { command, problemOf } from '../install/harness.ts';
import { query, valueOf } from '../workspaces/harness.ts';
import { sha256 } from '../blobs/harness.ts';
import { fileTests, files, openFilesFixture, preview, trust, trustEvents, trustRow, writeIn, type FilesFixture } from './harness.ts';

let fixture: FilesFixture;
beforeEach(async () => {
  fixture = await openFilesFixture();
  writeIn(fixture.root, '.kvman/rules/a.md', 'rule a');
});
afterEach(async () => {
  await fixture.close();
});

const read = (path: string): Promise<unknown> => files(fixture, 'filer.run', { op: 'read', path });
const closed = (): number => trustEvents(fixture).filter((event) => typeof event === 'object' && event !== null && !Array.isArray(event) && event['trusted'] === false).length;

async function listing(): Promise<unknown> {
  const answer = await query(fixture, 'kernel.workspaces.list', {});
  const value = typeof answer === 'object' && answer !== null && 'value' in answer && Array.isArray(answer.value) ? answer.value : [];
  return value.find((entry: unknown) => typeof entry === 'object' && entry !== null && 'id' in entry && entry.id === fixture.workspaceId);
}

describe('the trust gate (plan 07 §7.2, ADR 0137)', fileTests, () => {
  it('M2.5-H3 changing a trusted file closes the gate', async () => {
    await trust(fixture);
    expect(await read('.kvman/rules/a.md')).toEqual({ value: 'rule a' });
    writeIn(fixture.root, '.kvman/rules/a.md', 'rule a, changed');
    expect(await read('.kvman/rules/a.md')).toMatchObject({ code: 'WORKSPACE_UNTRUSTED' });
    expect(await query(fixture, 'kernel.workspace.get', { workspaceId: fixture.workspaceId })).toMatchObject({ ok: true, value: { trust: null } });
    expect(await listing()).toMatchObject({ trusted: false });
    expect(trustEvents(fixture)).toEqual([{ workspaceId: fixture.workspaceId, trusted: true }, { workspaceId: fixture.workspaceId, trusted: false }]);
  });

  it('M2.5-H7 a write to .kvman/rules/x.md through ctx.files closes the gate', async () => {
    await trust(fixture);
    expect(await files(fixture, 'filer.run', { op: 'write', path: '.kvman/rules/x.md', content: 'new rule' })).toEqual({ value: null });
    expect(readFileSync(join(fixture.root, '.kvman/rules/x.md'), 'utf8')).toBe('new rule');
    expect(trustRow(fixture)).toBeNull();
    expect(trustEvents(fixture)).toEqual([{ workspaceId: fixture.workspaceId, trusted: true }, { workspaceId: fixture.workspaceId, trusted: false }]);
    expect(await read('.kvman/rules/x.md')).toMatchObject({ code: 'WORKSPACE_UNTRUSTED' });
  });

  it('M2.5-E29 preview and grant', async () => {
    writeIn(fixture.root, '.kvman/skills/s/SKILL.md', 'skill');
    mkdirSync(join(fixture.root, '.kvman', 'empty'));
    const previewed = await trust(fixture);
    const expected = [{ path: '.kvman/rules/a.md', sha256: sha256('rule a') }, { path: '.kvman/skills/s/SKILL.md', sha256: sha256('skill') }];
    expect(previewed).toEqual({ files: expected, confirmationToken: expect.any(String) });
    expect(await query(fixture, 'kernel.workspace.get', { workspaceId: fixture.workspaceId })).toMatchObject({ ok: true, value: { trust: { mode: 'always', files: expected } } });
    expect(await listing()).toMatchObject({ trusted: true });
    expect(trustEvents(fixture)).toEqual([{ workspaceId: fixture.workspaceId, trusted: true }]);
    expect([await read('.kvman/rules/a.md'), await read('.kvman/skills/s/SKILL.md')]).toEqual([{ value: 'rule a' }, { value: 'skill' }]);
  });

  it('M2.5-E30 the gate while untrusted', async () => {
    writeIn(fixture.root, 'notes/n.md', 'n');
    for (const op of ['read', 'stat', 'list', 'write', 'mkdir', 'rm']) {
      expect(await files(fixture, 'filer.run', { op, path: op === 'list' || op === 'mkdir' ? '.kvman/rules' : '.kvman/rules/a.md', content: 'planted' }), op).toMatchObject({ code: 'WORKSPACE_UNTRUSTED' });
    }
    expect(readFileSync(join(fixture.root, '.kvman/rules/a.md'), 'utf8')).toBe('rule a');
    expect(await files(fixture, 'filer.run', { op: 'glob', pattern: '**/*' })).toEqual({ value: ['notes', 'notes/n.md'] });
  });

  it('M2.5-E31 every kind of change closes the gate once', async () => {
    const rule = join(fixture.root, '.kvman/rules/a.md');
    const changes: Array<[string, () => Promise<unknown> | void]> = [
      ['added', () => writeIn(fixture.root, '.kvman/rules/b.md', 'b')],
      ['removed', () => unlinkSync(rule)],
      ['changed', () => writeIn(fixture.root, '.kvman/rules/a.md', 'rule a again')],
      ['symlinked', () => {
        unlinkSync(rule);
        writeFileSync(join(fixture.root, 'plain.md'), 'rule a');
        symlinkSync(join(fixture.root, 'plain.md'), rule);
      }],
      ['removed by ctx.files', () => files(fixture, 'filer.run', { op: 'rm', path: '.kvman/rules/a.md' })],
      ['folder made by ctx.files', () => files(fixture, 'filer.run', { op: 'mkdir', path: '.kvman/new' })],
    ];
    for (const [name, change] of changes) {
      rmSync(join(fixture.root, '.kvman'), { recursive: true, force: true });
      writeIn(fixture.root, '.kvman/rules/a.md', 'rule a');
      await trust(fixture);
      const before = closed();
      await change();
      await Promise.all([read('.kvman/rules/a.md'), read('.kvman/rules/a.md')]);
      expect([name, trustRow(fixture), closed() - before]).toEqual([name, null, 1]);
    }
    rmSync(join(fixture.root, '.kvman'), { recursive: true });
    writeIn(fixture.root, '.kvman/rules/a.md', 'rule a');
    await trust(fixture);
    const later = new Date(Date.now() + 60_000);
    utimesSync(rule, later, later);
    expect(await read('.kvman/rules/a.md')).toEqual({ value: 'rule a' });
    expect(trustRow(fixture)).not.toBeNull();
  });

  it('M2.5-E32 previews that are refused', async () => {
    symlinkSync(join(fixture.root, '.kvman/rules/a.md'), join(fixture.root, '.kvman/link.md'));
    expect(await query(fixture, 'kernel.trust.preview', { workspaceId: fixture.workspaceId })).toMatchObject({ ok: false, problem: { code: 'WORKSPACE_UNTRUSTED', hint: expect.stringContaining('.kvman/link.md') } });
    unlinkSync(join(fixture.root, '.kvman/link.md'));
    for (let index = 0; index < 1000; index += 1) writeIn(fixture.root, `.kvman/many/${index}.md`, '');
    expect(await query(fixture, 'kernel.trust.preview', { workspaceId: fixture.workspaceId })).toMatchObject({ ok: false, problem: { code: 'PAYLOAD_TOO_LARGE', params: { limit: 'trust', max: 1000 } } });
    rmSync(join(fixture.root, '.kvman/many'), { recursive: true });
    writeIn(fixture.root, '.kvman/big.bin', Buffer.alloc(64 * 1024 * 1024 + 1));
    expect(await query(fixture, 'kernel.trust.preview', { workspaceId: fixture.workspaceId })).toMatchObject({ ok: false, problem: { code: 'PAYLOAD_TOO_LARGE', params: { limit: 'trust', max: 67108864 } } });
  });

  it('M2.5-E34 who may grant and revoke', async () => {
    const previewed = await preview(fixture);
    const grant = { type: 'kernel.trust.grant', payload: { confirmationToken: previewed.confirmationToken, mode: 'always' } };
    expect(await files(fixture, 'trustee.call', grant)).toMatchObject({ code: 'CALLER_NOT_ALLOWED' });
    await trust(fixture);
    expect(await files(fixture, 'trustee.call', { type: 'kernel.trust.revoke', payload: { workspaceId: fixture.workspaceId } })).toEqual({ value: {} });
    expect(trustRow(fixture)).toBeNull();
    expect(closed()).toBe(1);
    expect(valueOf(await command(fixture, 'kernel.trust.revoke', { workspaceId: fixture.workspaceId }))).toEqual({});
    expect(closed()).toBe(2);
    const stale = await preview(fixture);
    fixture.timers.advance(10 * 60_000 + 1);
    expect(problemOf(await command(fixture, 'kernel.trust.grant', { confirmationToken: stale.confirmationToken, mode: 'once' })).code).toBe('CONFIRMATION_EXPIRED');
  });
});
