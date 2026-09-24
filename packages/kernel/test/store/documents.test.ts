import { describe, expect, it } from 'vitest';
import { invocationMessage } from '../storage/harness.ts';
import { commitWrites, handlerStore, openStoreFixture, seedDocuments } from './harness.ts';

describe('documents and scopes (ADRs 0037, 0040)', () => {
  it('M1.2-E6 patch is a JSON Merge Patch; a missing id fails STORE_NOT_FOUND', async () => {
    const fixture = openStoreFixture();
    await seedDocuments(fixture, 'files', [{ id: 'f1', status: 'ready', meta: { pages: 3, lang: 'en' }, tags: ['a', 'b'], note: 'old' }]);
    const files = handlerStore(fixture).store.collection('files');
    expect(await files.patch('f1', { meta: { lang: 'ar' }, tags: ['c'], note: null })).toEqual({ id: 'f1', status: 'ready', meta: { pages: 3, lang: 'ar' }, tags: ['c'] });
    await expect(files.patch('missing', { status: 'x' })).rejects.toMatchObject({ problem: { code: 'STORE_NOT_FOUND' } });
  });

  it('M1.2-E7 writes are validated, need a string id, and follow idField', async () => {
    const fixture = openStoreFixture();
    const { store } = handlerStore(fixture);
    expect(() => store.collection('files').put({ id: 'f1', invalid: true })).toThrow(expect.objectContaining({ problem: expect.objectContaining({ code: 'VALIDATION_FAILED' }) }));
    expect(() => store.collection('files').put({ id: 7 })).toThrow(expect.objectContaining({ problem: expect.objectContaining({ code: 'VALIDATION_FAILED' }) }));
    await seedDocuments(fixture, 'files', [{ id: 'f2' }]);
    await expect(store.collection('files').patch('f2', { invalid: 1 })).rejects.toMatchObject({ problem: { code: 'VALIDATION_FAILED' } });
    store.collection('records').put({ fileId: 'r1', note: 'keyed by fileId' });
    expect(await store.collection('records').get('r1')).toEqual({ fileId: 'r1', note: 'keyed by fileId' });
  });

  it('M1.2-E8 unregistered collections and logs are refused with a hint', () => {
    const { store } = handlerStore(openStoreFixture());
    expect(() => store.collection('unknown')).toThrow(expect.objectContaining({ problem: expect.objectContaining({ code: 'VALIDATION_FAILED', hint: 'registered collections: files, records' }) }));
    expect(() => store.log('audit:1')).toThrow(expect.objectContaining({ problem: expect.objectContaining({ code: 'VALIDATION_FAILED', hint: 'registered logs: history:*, audit' }) }));
    expect(() => store.log('history:')).toThrow(expect.objectContaining({ problem: expect.objectContaining({ code: 'VALIDATION_FAILED' }) }));
  });

  it('M1.2-E9 without a workspace only the global store works', async () => {
    const fixture = openStoreFixture();
    const { store } = handlerStore(fixture, { workspace: null });
    const workspaceInvalid = expect.objectContaining({ problem: expect.objectContaining({ code: 'WORKSPACE_INVALID', hint: 'use ctx.store.global' }) });
    expect(() => store.kv).toThrow(workspaceInvalid);
    expect(() => store.collection('files')).toThrow(workspaceInvalid);
    expect(() => store.log('audit')).toThrow(workspaceInvalid);
    store.global.kv.set('ok', true);
    expect(await store.global.kv.get('ok')).toBe(true);
    const invocation = await invocationMessage(fixture);
    const { workspaceId: _workspace, ...withoutWorkspace } = invocation;
    expect(await commitWrites(fixture, [{ kind: 'kv.set', scope: 'workspace', key: 'k', value: 1 }], withoutWorkspace)).toMatchObject({ committed: false, problem: { code: 'WORKSPACE_INVALID' } });
  });

  it('M1.2-E10 a query store reads but cannot write', async () => {
    const fixture = openStoreFixture();
    await seedDocuments(fixture, 'files', [{ id: 'f1', status: 'ready' }]);
    const { store } = handlerStore(fixture, { readOnly: true });
    expect(await store.collection('files').get('f1')).toEqual({ id: 'f1', status: 'ready' });
    const denied = expect.objectContaining({ problem: expect.objectContaining({ code: 'CAPABILITY_DENIED' }) });
    expect(() => store.kv.set('k', 1)).toThrow(denied);
    expect(() => store.kv.delete('k')).toThrow(denied);
    expect(() => store.collection('files').put({ id: 'f2' })).toThrow(denied);
    expect(() => store.collection('files').delete('f1')).toThrow(denied);
    await expect(store.collection('files').patch('f1', {})).rejects.toMatchObject({ problem: { code: 'CAPABILITY_DENIED' } });
    await expect(store.log('audit').append(1)).rejects.toMatchObject({ problem: { code: 'CAPABILITY_DENIED' } });
    expect(() => store.log('audit').truncateBefore(1)).toThrow(denied);
    expect(() => store.log('audit').drop()).toThrow(denied);
  });

  it('M1.2-E11 bad limits and malformed filters fail validation', async () => {
    const files = handlerStore(openStoreFixture()).store.collection('files');
    for (const query of [{ limit: 0 }, { limit: 2.5 }, { where: { status: { between: [1, 2] } } }]) {
      await expect(files.find(query as never), JSON.stringify(query)).rejects.toMatchObject({ problem: { code: 'VALIDATION_FAILED' } });
    }
  });
});
