import { flushPromises } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import type { Session } from '../../src/index.ts';
import { progress } from './support/fake-kvman.ts';
import { session, turn, user } from './support/fixtures.ts';
import { deferred, withOwner } from './support/conversation-owner.ts';

describe('scope and latest-load ownership (ADR0041 E86)', () => {
  it('a reversed same-scope session read cannot replace newer state or its stream', async () => {
    await withOwner(async ({ fake, world, chat, attached }) => {
      const older = deferred<Session>(); let hold = true;
      fake.handle('kvcoder.session.get', () => { if (hold) { hold = false; return older.promise; } return world.found; });
      const pending = chat.refresh(); await flushPromises();
      world.found = session({ title: 'new', status: 'running', stepJobId: 'j2' });
      world.turns = [turn({ id: 'new-turn' })]; world.context = { tokens: 234, window: 1000, compactAt: 800 };
      await chat.refresh(); fake.emit('j2', progress('@kvman/kvai', { type: 'text', delta: 'new live' })); await flushPromises();
      older.resolve(session({ title: 'old', status: 'running', stepJobId: 'j1' })); await pending; await flushPromises();
      expect(chat.session.value?.title).toBe('new'); expect(chat.live.text).toBe('new live');
      expect(chat.turns.value).toEqual(world.turns); expect(chat.context.value).toEqual(world.context);
      expect(attached).toEqual(['j1', 'j2']);
    });
  });

  it.each(['resolve', 'reject'] as const)('a late message %s cannot publish after navigation', async outcome => {
    await withOwner(async ({ fake, world, id, chat }) => {
      const older = deferred<{ messages: ReturnType<typeof user>[]; omitted: number }>();
      fake.handle('kvcoder.message.list', input => input['sessionId'] === 's1' ? older.promise : { messages: world.messages, omitted: world.omitted });
      const pending = chat.refresh(); await flushPromises();
      world.found = session({ id: 's2', title: 'new' }); world.messages = [user('new scope', { sessionId: 's2' })]; world.omitted = 3;
      world.turns = [turn({ id: 't2', sessionId: 's2' })]; id.value = 's2'; await flushPromises();
      if (outcome === 'resolve') older.resolve({ messages: [user('old scope')], omitted: 99 });
      else older.reject(new Error('old message failure'));
      await pending; await flushPromises();
      expect(chat.messages.value).toEqual(world.messages); expect(chat.omitted.value).toBe(3);
      expect(chat.loadFailure.value).toBeUndefined(); expect(chat.session.value?.title).toBe('new');
    });
  });

  it('a stale same-scope message load cannot overwrite a later successful refresh', async () => {
    await withOwner(async ({ fake, world, chat }) => {
      const older = deferred<{ messages: ReturnType<typeof user>[]; omitted: number }>(); let hold = true;
      fake.handle('kvcoder.message.list', () => { if (hold) { hold = false; return older.promise; } return { messages: world.messages, omitted: world.omitted }; });
      const pending = chat.refresh(); await flushPromises();
      world.messages = [user('new message')]; world.omitted = 7; await chat.refresh();
      older.resolve({ messages: [user('old message')], omitted: 99 }); await pending;
      expect(chat.messages.value).toEqual(world.messages); expect(chat.omitted.value).toBe(7);
    }, { messages: [] });
  });

  it('returning to identical scope IDs cannot revive an earlier pending read', async () => {
    await withOwner(async ({ fake, world, id, chat }) => {
      const older = deferred<Session>(); let hold = true;
      fake.handle('kvcoder.session.get', () => { if (hold) { hold = false; return older.promise; } return world.found; });
      const pending = chat.refresh(); await flushPromises();
      world.found = session({ id: 's2' }); world.turns = [turn({ sessionId: 's2' })]; id.value = 's2'; await flushPromises();
      world.found = session({ title: 'returned' }); world.turns = [turn()]; id.value = 's1'; await flushPromises();
      older.resolve(session({ title: 'old visit' })); await pending; await flushPromises();
      expect(chat.session.value?.title).toBe('returned');
    });
  });

  it('a late primary query failure cannot toast after scope replacement', async () => {
    await withOwner(async ({ fake, world, id, chat, failed }) => {
      const older = deferred<Session>(); let hold = true;
      fake.handle('kvcoder.session.get', () => { if (hold) { hold = false; return older.promise; } return world.found; });
      const pending = chat.refresh(); await flushPromises();
      world.found = session({ id: 's2' }); world.turns = [turn({ sessionId: 's2' })]; id.value = 's2'; await flushPromises();
      older.reject(new Error('old query failure')); await pending; await flushPromises();
      expect(failed).not.toHaveBeenCalled(); expect(chat.session.value?.id).toBe('s2');
    });
  });

  it('a child with a foreign parent is neither shown nor followed', async () => {
    await withOwner(async ({ fake, world, chat, attached }) => {
      world.found = session({ status: 'waiting' });
      world.turns = [turn({ pending: [{ kind: 'subagent', toolCallId: 'c1', questionId: null, question: null, childSessionId: 'child' }] })];
      fake.handle('kvcoder.session.get', input => input['sessionId'] === 'child' ? session({ id: 'child', parentId: 'another-parent', status: 'running', stepJobId: 'foreign' }) : world.found);
      await chat.refresh(); await flushPromises();
      expect(chat.children.size).toBe(0); expect(attached).toEqual(['j1']);
    });
  });

  it('a late child lookup cannot recreate a child removed by a newer load', async () => {
    await withOwner(async ({ fake, world, chat, attached }) => {
      const child = deferred<Session>();
      world.found = session({ status: 'waiting' });
      world.turns = [turn({ pending: [{ kind: 'subagent', toolCallId: 'c1', questionId: null, question: null, childSessionId: 'child' }] })];
      fake.handle('kvcoder.session.get', input => input['sessionId'] === 'child' ? child.promise : world.found);
      const pending = chat.refresh(); await flushPromises();
      world.found = session(); world.turns = [turn()]; await chat.refresh();
      child.resolve(session({ id: 'child', parentId: 's1', status: 'running', stepJobId: 'stale-child' })); await pending; await flushPromises();
      expect(chat.children.size).toBe(0); expect(attached).toEqual(['j1']);
    });
  });
});
