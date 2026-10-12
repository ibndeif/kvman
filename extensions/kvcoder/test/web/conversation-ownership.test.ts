import { flushPromises } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import type { StreamEvent } from '@kvman/sdk/web';
import { progress } from './support/fake-kvman.ts';
import { session, turn } from './support/fixtures.ts';
import { deferred, withOwner } from './support/conversation-owner.ts';

const text = (delta: string) => progress('@kvman/kvai', { type: 'text', delta });
const hint = (jobId: string) => progress('@kvman/kvcoder', { type: 'follow', jobId });

describe('authoritative frontend stream ownership (ADR0041 E86)', () => {
  it('follows the saved successor, not a conflicting raw hint', async () => {
    await withOwner(async ({ fake, world, attached, follow, chat }) => {
      world.found = session({ status: 'running', stepJobId: 'j2' });
      fake.emit('j1', hint('foreign-job')); fake.end('j1');
      await flushPromises();
      expect(attached).toEqual(['j1', 'j2']);
      expect(follow.mock.calls.map(([id]) => id)).toEqual(['j1', 'j2']);
      fake.emit('j2', text('current')); fake.emit('foreign-job', text('foreign'));
      await flushPromises();
      expect(chat.live.text).toBe('current');
    });
  });

  it.each(['idle', 'waiting'] as const)('does not follow a raw hint when authoritative state is %s', async status => {
    await withOwner(async ({ fake, world, attached, chat }) => {
      world.found = session({ status });
      fake.emit('j1', hint('foreign-job')); fake.end('j1');
      await flushPromises();
      expect(attached).toEqual(['j1']); expect(chat.streaming.value).toBe(false);
    });
  });

  it('duplicate stream requests cannot erase an active live answer', async () => {
    await withOwner(async ({ fake, chat, attached }) => {
      fake.emit('j1', text('keep me')); await flushPromises();
      await chat.stream('j1');
      expect(chat.live.text).toBe('keep me'); expect(chat.streaming.value).toBe(true);
      expect(attached).toEqual(['j1']);
    });
  });

  it('a caller-provided unrelated job never attaches or replaces current live state', async () => {
    await withOwner(async ({ fake, chat, attached }) => {
      fake.emit('j1', text('current')); await flushPromises();
      const requested = chat.stream('unowned'); fake.end('unowned');
      await requested; await flushPromises();
      expect(attached).toEqual(['j1']); expect(chat.live.text).toBe('current');
    });
  });

  it('old events, end and finally cannot alter a reread successor', async () => {
    await withOwner(async ({ fake, world, chat, attached }) => {
      world.found = session({ status: 'running', stepJobId: 'j2' });
      await chat.refresh();
      fake.emit('j2', text('new')); await flushPromises();
      fake.emit('j1', text('old')); fake.end('j1'); await flushPromises();
      expect(chat.live.text).toBe('new'); expect(chat.streaming.value).toBe(true);
      expect(attached).toEqual(['j1', 'j2']);
    });
  });

  it.each(['session', 'workspace'] as const)('old streams cannot publish across a %s switch', async scope => {
    await withOwner(async ({ fake, world, id, chat, attached }) => {
      const nextId = scope === 'session' ? 's2' : 's1';
      world.found = session({ id: nextId, status: 'running', stepJobId: 'j2' });
      world.turns = [turn({ sessionId: nextId })];
      if (scope === 'session') id.value = nextId;
      else fake.workspace.value = { id: 'other', name: 'Other', path: '/other' };
      await flushPromises();
      fake.emit('j2', text('new scope')); await flushPromises();
      fake.emit('j1', text('old scope')); fake.end('j1'); await flushPromises();
      expect(chat.live.text).toBe('new scope'); expect(chat.session.value?.id).toBe(nextId);
      expect(attached).toEqual(['j1', 'j2']);
    });
  });

  it('a removed child hint cannot attach an unowned stream', async () => {
    await withOwner(async ({ fake, world, attached, chat }) => {
      world.found = session({ status: 'waiting' }); world.turns = [turn()];
      fake.emit('j1', progress('@kvman/kvcoder', { type: 'subagent', sessionId: 'removed', jobId: 'foreign' }));
      await flushPromises();
      expect(attached).toEqual(['j1']); expect(chat.children.size).toBe(0);
    });
  });

  it('child hints use the saved child job and never make the parent streaming', async () => {
    await withOwner(async ({ fake, world, chat, attached }) => {
      world.found = session({ status: 'waiting' });
      world.turns = [turn({ pending: [{ kind: 'subagent', toolCallId: 'c1', questionId: null, question: null, childSessionId: 'child' }] })];
      fake.handle('kvcoder.session.get', input => input['sessionId'] === 'child' ? session({ id: 'child', parentId: 's1', status: 'running', stepJobId: 'child-current' }) : world.found);
      fake.emit('j1', progress('@kvman/kvcoder', { type: 'subagent', sessionId: 'child', jobId: 'child-stale' }));
      await flushPromises(); fake.end('j1'); await flushPromises();
      expect(attached).toEqual(['j1', 'child-current']); expect(chat.streaming.value).toBe(false);
      fake.emit('child-current', text('child answer')); await flushPromises();
      expect(chat.children.get('child')?.live.text).toBe('child answer');
    });
  });

  it('releases a throwing stream owner so a later explicit refresh can reattach', async () => {
    await withOwner(async ({ fake, world, chat, follow, failed }) => {
      const error = new Error('stream disconnected'); const ended = deferred<void>(); let once = true;
      const original = fake.kvman.stream;
      async function* connection() {
        if (once) { once = false; throw error; }
        yield text('reconnected'); await ended.promise;
      }
      fake.kvman.stream = jobId => jobId === 'j2' ? connection() : original(jobId);
      try {
        world.found = session({ status: 'running', stepJobId: 'j2' }); await chat.refresh(); await flushPromises();
        expect(failed.mock.calls).toEqual([[error]]); expect(chat.streaming.value).toBe(false);
        await chat.refresh(); await flushPromises();
        expect(chat.live.text).toBe('reconnected'); expect(chat.streaming.value).toBe(true);
        expect(follow.mock.calls.map(([id]) => id)).toEqual(['j1', 'j2', 'j2']);
      } finally { ended.resolve(); await flushPromises(); }
    });
  });

  it('a yielded SDK OFFLINE does not make a running job terminal', async () => {
    await withOwner(async ({ fake, world, chat, follow }) => {
      const original = fake.kvman.stream; let once = true;
      // Exact SDK transport event from kvwebui's job-stream/offline modules; no cross-package private import.
      async function* disconnected(): AsyncGenerator<StreamEvent> {
        yield { type: 'problem', problem: { code: 'kvwebui/OFFLINE', message: "kvman didn't answer." } };
      }
      fake.kvman.stream = jobId => {
        if (jobId === 'j2' && once) { once = false; return disconnected(); }
        return original(jobId);
      };
      world.found = session({ status: 'running', stepJobId: 'j2' }); await chat.refresh(); await flushPromises();
      expect(chat.streaming.value).toBe(false); expect(follow.mock.calls.map(([id]) => id)).toEqual(['j1', 'j2']);
      await chat.refresh(); await flushPromises();
      expect(follow.mock.calls.map(([id]) => id)).toEqual(['j1', 'j2', 'j2']);
      fake.emit('j2', text('connected again')); await flushPromises();
      expect(chat.live.text).toBe('connected again'); expect(chat.streaming.value).toBe(true);
    });
  });

  it('does not repeatedly reattach a completed job whose old pointer is still visible', async () => {
    await withOwner(async ({ fake, chat, attached }) => {
      fake.end('j1'); await flushPromises(); await chat.refresh();
      expect(attached).toEqual(['j1']); expect(chat.streaming.value).toBe(false);
    });
  });

  it('ignores late follow errors after unmount', async () => {
    await withOwner(async ({ fake, world, chat, view, failed }) => {
      const ended = deferred<void>(); fake.kvman.follow = () => ended.promise;
      world.found = session({ status: 'running', stepJobId: 'j2' }); await chat.refresh();
      view.unmount(); ended.reject(new Error('old follow failure')); await flushPromises();
      expect(failed).not.toHaveBeenCalled();
    });
  });
});
