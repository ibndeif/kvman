import { recordExtension, schedulePayloadIssues } from '@kvman/kernel';
import { jsonObjectSchema, type Json } from '@kvman/protocol';
import { defineExtension, z, type Ext } from '@kvman/sdk';
import { afterEach, describe, expect, it } from 'vitest';
import { openInstallFixture, type InstallFixture } from '../install/harness.ts';
import { query } from '../workspaces/harness.ts';
import { correlationId, errorsOf, recordedIssues } from './harness.ts';

const handle = async (): Promise<null> => null;

let fixture: InstallFixture | undefined;

afterEach(async () => {
  await fixture?.close();
  fixture = undefined;
});

function withCommands(schedule: (ext: Ext) => void): (ext: Ext) => void {
  return (ext) => {
    ext.registerCommand('pdf.prune', { description: 'Prunes.', input: z.object({ days: z.number() }), access: 'internal', handle });
    ext.registerCommand('pdf.approve', { description: 'Approves.', input: z.object({}), access: 'user', handle });
    ext.registerEvent('pdf.pruned', { description: 'Pruned.', payload: z.object({}) });
    schedule(ext);
  };
}

// The manifest a valid recording gives, for the checks that run on the kernel's main thread.
function recorded(schedule: (ext: Ext) => void): Json {
  const definition = defineExtension({ name: '@acme/pdf', namespace: 'pdf', title: 'Test', description: 'A test extension.' }, withCommands(schedule));
  return jsonObjectSchema.parse(JSON.parse(JSON.stringify(recordExtension(definition, { packageName: '@acme/pdf', version: '1.0.0', correlationId }).manifest)));
}

describe('schedule rules (ADR 0144)', () => {
  it('M2.7-E31 schedule rules are checked at validation', async () => {
    const issue = (schedule: (ext: Ext) => void) => errorsOf(recordedIssues(withCommands(schedule))).map((found) => [found.path, found.hint !== undefined]);
    expect(issue((ext) => ext.registerSchedule('other', { description: 'Other.', every: '1h', command: 'fs.file.delete' }))).toEqual([['schedules.0.command', true]]);
    expect(issue((ext) => ext.registerSchedule('event', { description: 'Event.', every: '1h', command: 'pdf.pruned' }))).toEqual([['schedules.0.command', true]]);
    expect(issue((ext) => ext.registerSchedule('user', { description: 'User.', every: '1h', command: 'pdf.approve' }))).toEqual([['schedules.0.command', true]]);
    expect(issue((ext) => ext.registerSchedule('bad', { description: 'Bad.', cron: '61 * * * *', command: 'pdf.prune', payload: { days: 1 } }))).toEqual([['schedules.0.cron', true]]);
    expect(issue((ext) => ext.registerSchedule('never', { description: 'Never.', cron: '0 0 30 2 *', command: 'pdf.prune', payload: { days: 1 } }))).toEqual([['schedules.0.cron', true]]);

    const wrongPayload = recorded((ext) => ext.registerSchedule('prune', { description: 'Prunes.', every: '1h', command: 'pdf.prune', payload: { days: 'many' } }));
    expect(schedulePayloadIssues(wrongPayload).map((found) => [found.path, found.hint !== undefined])).toEqual([['schedules.0.payload.days', true]]);
    const noPayload = recorded((ext) => ext.registerSchedule('prune', { description: 'Prunes.', every: '1h', command: 'pdf.prune' }));
    expect(schedulePayloadIssues(noPayload).map((found) => found.path)).toEqual(['schedules.0.payload.days']);
    const valid = recorded((ext) => ext.registerSchedule('prune', { description: 'Prunes.', cron: '0 9 * * mon-fri', command: 'pdf.prune', payload: { days: 7 } }));
    expect(schedulePayloadIssues(valid)).toEqual([]);

    fixture = await openInstallFixture();
    const answered = jsonObjectSchema.parse(JSON.parse(JSON.stringify(await query(fixture, 'kernel.validate', { manifest: wrongPayload }))));
    expect(answered).toMatchObject({ ok: true, value: { ok: false, issues: [
      expect.objectContaining({ path: 'meta.title', severity: 'warning', message: expect.stringContaining('literal') }),
      expect.objectContaining({ path: 'schedules.0.payload.days' }),
    ] } });
    const clean = jsonObjectSchema.parse(JSON.parse(JSON.stringify(await query(fixture, 'kernel.validate', { manifest: valid }))));
    expect(clean).toMatchObject({ ok: true, value: { ok: true } });
  });
});
