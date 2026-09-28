import { afterEach, describe, expect, it } from 'vitest';
import { eventually, workspaceA } from '../hosts/harness.ts';
import { person, problemOf } from '../install/harness.ts';
import { admission, query, rows, run, valueOf } from '../workspaces/harness.ts';
import { emit, issuePaths, notificationTests, openNotificationFixture, tray, type NoticeSend, type NotificationFixture } from './harness.ts';

let current: NotificationFixture | undefined;

afterEach(async () => {
  await current?.close();
  current = undefined;
});

async function opened(): Promise<NotificationFixture> {
  current = await openNotificationFixture();
  return current;
}

function emitRows(fixture: NotificationFixture): Array<Record<string, unknown>> {
  return rows(fixture.fixture, "SELECT type, state, attempts FROM messages WHERE type = 'herald.emit' ORDER BY created_at");
}

function uiNotifyRows(fixture: NotificationFixture): Array<Record<string, unknown>> {
  return rows(fixture.fixture, "SELECT state FROM messages WHERE type = 'ui.notify'");
}

describe('ui senders and admission (ADR 0162)', notificationTests, () => {
  it('M2.12-H2 a power-granting button fails the whole unit without storing anything', async () => {
    const fixture = await opened();
    const reply = await emit(fixture, [{
      kind: 'notify',
      value: { title: '$t.notify.done', actions: [{ label: 'Enable', command: 'kernel.extension.enable' }] },
    }], { note: 'x' });
    const problem = problemOf(reply);
    expect(problem.code).toBe('CAPABILITY_DENIED');
    expect(problem.detail).toContain('kernel.extension.enable');
    const failed = [{ type: 'herald.emit', state: 'failed', attempts: 0 }];
    expect(emitRows(fixture)).toEqual(failed);
    fixture.fixture.timers.advance(3_600_000);
    expect(emitRows(fixture)).toEqual(failed);
    expect(await query(fixture.fixture, 'herald.state.get', {}, person, workspaceA)).toMatchObject({ ok: true, value: { note: null } });
    expect(uiNotifyRows(fixture)).toEqual([]);
    expect(await tray(fixture, workspaceA)).toEqual([]);
  });

  it('M2.12-E1 a person and a process may not send ui.notify', async () => {
    const fixture = await opened();
    const notice = { title: '$t.notify.done' };
    expect(await admission(fixture.fixture, 'ui.notify', notice)).toBe('CALLER_NOT_ALLOWED');
    expect(await admission(fixture.fixture, 'ui.notify', notice, { address: 'proc:p1', extension: '@acme/herald' })).toBe('CALLER_NOT_ALLOWED');
    expect(uiNotifyRows(fixture)).toEqual([]);
  });

  it('M2.12-E2 sending without the ui capability fails and writes nothing', async () => {
    const fixture = await opened();
    const reply = await run(fixture.fixture, 'quiet.emit', {}, workspaceA);
    const problem = problemOf(reply);
    expect(problem.code).toBe('CAPABILITY_DENIED');
    expect(problem.hint).toContain('ui');
    const failed = [{ state: 'failed', attempts: 0 }];
    expect(rows(fixture.fixture, "SELECT state, attempts FROM messages WHERE type = 'quiet.emit'")).toEqual(failed);
    fixture.fixture.timers.advance(3_600_000);
    expect(rows(fixture.fixture, "SELECT state, attempts FROM messages WHERE type = 'quiet.emit'")).toEqual(failed);
    expect(await query(fixture.fixture, 'quiet.note.get', {}, person, workspaceA)).toMatchObject({ ok: true, value: { note: null } });
    expect(uiNotifyRows(fixture)).toEqual([]);
    expect(await tray(fixture, workspaceA)).toEqual([]);
  });

  it('M2.12-E3 too many buttons, a bad level, a relative navigate, and an empty dismiss key fail validation', async () => {
    const fixture = await opened();
    const buttons = [
      { label: 'One', command: 'herald.redo' },
      { label: 'Two', command: 'herald.redo' },
      { label: 'Three', command: 'herald.redo' },
    ];
    const cases: Array<{ sends: NoticeSend[]; path: string }> = [
      { sends: [{ kind: 'notify', value: { title: 'Three', actions: buttons } }], path: 'actions' },
      { sends: [{ kind: 'toast', value: { text: 'Loud', level: 'loud' } }], path: 'level' },
      { sends: [{ kind: 'navigate', value: 'files' }], path: 'route' },
      { sends: [{ kind: 'dismiss', value: '' }], path: 'key' },
    ];
    for (const { sends, path } of cases) {
      const problem = problemOf(await emit(fixture, sends));
      expect(problem.code).toBe('VALIDATION_FAILED');
      expect(issuePaths(problem)).toEqual(expect.arrayContaining([expect.stringContaining(path)]));
    }
    expect(rows(fixture.fixture, "SELECT COUNT(*) AS missing FROM messages WHERE type LIKE 'ui.%'")).toEqual([{ missing: 0 }]);
    expect(await tray(fixture, workspaceA)).toEqual([]);
    expect(emitRows(fixture)).toEqual(cases.map(() => ({ type: 'herald.emit', state: 'failed', attempts: 0 })));
  });

  it('M2.12-E4 a refused send with onReply commits nothing and delivers no continuation', async () => {
    const fixture = await opened();
    valueOf(await emit(fixture, [{ kind: 'notify', value: { title: '$t.notify.done' } }], { onReply: true }));
    const delivered = { ok: true, value: { replies: [{ reply: { ok: true, value: { ok: true } } }] } };
    await eventually(async () => {
      expect(await query(fixture.fixture, 'herald.state.get', {}, person, workspaceA)).toMatchObject(delivered);
    });
    const problem = problemOf(await emit(fixture, [{
      kind: 'notify',
      value: { title: '$t.notify.done', actions: [{ label: 'Apply', command: 'kernel.preset.apply' }] },
    }], { onReply: true }));
    expect(problem.code).toBe('CAPABILITY_DENIED');
    expect(problem.detail).toContain('kernel.preset.apply');
    expect(uiNotifyRows(fixture)).toEqual([{ state: 'done' }]);
    expect(await query(fixture.fixture, 'herald.state.get', {}, person, workspaceA)).toMatchObject(delivered);
  });

  it('M2.12-E5 commands to ui.toast and ui.notify answer ok and store done rows for the person', async () => {
    const fixture = await opened();
    const reply = await emit(fixture, [
      { kind: 'toast', value: { text: 'Hello' } },
      { kind: 'notify', value: { title: '$t.notify.done' } },
    ], { via: 'command' });
    expect(valueOf(reply)).toEqual({ replies: [{ ok: true }, { ok: true }] });
    expect(rows(fixture.fixture, "SELECT type, state, handler, target, result FROM messages WHERE type LIKE 'ui.%' ORDER BY created_at")).toEqual([
      { type: 'ui.toast', state: 'done', handler: 'kernel', target: 'user:local', result: '{"ok":true,"value":{"ok":true}}' },
      { type: 'ui.notify', state: 'done', handler: 'kernel', target: 'user:local', result: '{"ok":true,"value":{"ok":true}}' },
    ]);
  });

  it('M2.12-E6 a runtime text key outside every catalog is stored as sent', async () => {
    const fixture = await opened();
    valueOf(await emit(fixture, [{ kind: 'notify', value: { title: '$t.nowhere.at-all' } }]));
    expect(await tray(fixture, workspaceA)).toMatchObject([{ title: '$t.nowhere.at-all' }]);
  });
});
