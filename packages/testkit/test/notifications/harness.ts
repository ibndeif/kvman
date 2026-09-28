import { fileURLToPath } from 'node:url';
import { EventHub, type Sender } from '@kvman/kernel';
import {
  notificationsChangedSchema, notificationsCountResultSchema, notificationsListResultSchema, sseMessageSchemas,
  type Isolation, type Json, type NotificationItem, type NotificationsCountResult, type Problem, type ReplyPayload, type SseMessage,
} from '@kvman/protocol';
import type { ExtensionDefinition } from '@kvman/sdk';
import { workspaceA, workspaceB } from '../hosts/harness.ts';
import { installFixture } from '../install/fixture-snapshots.ts';
import { command, person, type InstallFixture } from '../install/harness.ts';
import { enable, grantsOf, openWorkspaceFixture, valueOf } from '../workspaces/harness.ts';
import crier from './fixtures/extensions/crier.ts';
import herald from './fixtures/extensions/herald.ts';
import quiet from './fixtures/extensions/quiet.ts';
import { RecordingSink } from './stream-sink.ts';

export const notificationTests = { timeout: 60_000 };

const heraldName = '@acme/herald';
const crierName = '@acme/crier';
const quietName = '@acme/quiet';

// The tab the tests send from when a toast or navigate needs a tab target.
export const tab: Sender = { address: 'user:local/client:c1' };

export type NotificationFixture = {
  fixture: InstallFixture;
  hub: EventHub;
  sink: RecordingSink;
  close(): Promise<void>;
};

// The M2.3 workspace fixture (workspaces A and B, the manual kernel clock) with Herald enabled in A and B and Crier
// and Quiet enabled in A, plus an EventHub with one connected stream S subscribed to the tray changes.
export async function openNotificationFixture(options: { herald?: Isolation } = {}): Promise<NotificationFixture> {
  const fixture = await openWorkspaceFixture();
  const folder = fileURLToPath(new URL('./fixtures/extensions/', import.meta.url));
  const packages: Array<{ definition: ExtensionDefinition; entry: string }> = [
    { definition: herald, entry: 'herald.ts' },
    { definition: crier, entry: 'crier.ts' },
    { definition: quiet, entry: 'quiet.ts' },
  ];
  for (const { definition, entry } of packages) {
    await installFixture(fixture.connection, fixture.home, { definition, folder, entry });
  }
  fixture.runtime.registry.refresh();
  const heraldIsolation: Isolation = options.herald ?? 'shared';
  valueOf(await enable(fixture, workspaceA, heraldName, grantsOf(fixture, heraldName, heraldIsolation)));
  valueOf(await enable(fixture, workspaceB, heraldName, grantsOf(fixture, heraldName, heraldIsolation)));
  valueOf(await enable(fixture, workspaceA, crierName, grantsOf(fixture, crierName, 'shared')));
  valueOf(await enable(fixture, workspaceA, quietName, grantsOf(fixture, quietName, 'shared')));
  const hub = new EventHub({
    connection: fixture.connection, files: fixture.runtime.files.files, pipeline: fixture.runtime.pipeline,
    live: fixture.runtime.live, timers: fixture.timers, version: '0.0.0', now: () => fixture.timers.time.value,
  });
  const sink = new RecordingSink();
  hub.connect('S', sink, undefined);
  if (hub.subscribe({ stream: 'S', sid: 'tray', events: ['kernel.notifications.changed'] }) !== 'subscribed') {
    throw new Error('stream S did not subscribe to kernel.notifications.changed');
  }
  return {
    fixture, hub, sink,
    close: async () => {
      hub.close();
      await fixture.close();
    },
  };
}

export type NoticeSend = { kind: 'toast' | 'notify' | 'dismiss' | 'navigate'; value: Json };

export type EmitOptions = {
  workspaceId?: string;
  sender?: Sender;
  note?: string;
  via?: 'send' | 'command';
  onReply?: boolean;
};

function emitPayload(sends: NoticeSend[], options: EmitOptions): Json {
  return {
    sends,
    ...(options.note === undefined ? {} : { note: options.note }),
    ...(options.via === undefined ? {} : { via: options.via }),
    ...(options.onReply === undefined ? {} : { onReply: options.onReply }),
  };
}

// herald.emit as the person sends it (or the tab, or another sender when given).
export function emit(current: NotificationFixture, sends: NoticeSend[], options: EmitOptions = {}): Promise<ReplyPayload> {
  return command(current.fixture, 'herald.emit', emitPayload(sends, options), options.sender ?? person, options.workspaceId ?? workspaceA);
}

// crier.emit as the person sends it.
export function emitCrier(current: NotificationFixture, sends: NoticeSend[], options: EmitOptions = {}): Promise<ReplyPayload> {
  return command(current.fixture, 'crier.emit', { sends }, options.sender ?? person, options.workspaceId ?? workspaceA);
}

// herald.emit-global: a global message without a workspace.
export function emitGlobal(current: NotificationFixture, sends: NoticeSend[], options: { sender?: Sender } = {}): Promise<ReplyPayload> {
  return command(current.fixture, 'herald.emit-global', { sends }, options.sender ?? person);
}

// The items of kernel.notifications.list: a workspace and the global entries, or every entry.
export async function tray(current: NotificationFixture, workspaceId?: string): Promise<NotificationItem[]> {
  const answer = await current.fixture.runtime.query({
    sender: person, type: 'kernel.notifications.list',
    payload: workspaceId === undefined ? {} : { workspaceId },
    cause: undefined, workspaceId: undefined,
  });
  if (!answer.ok) throw new Error(`kernel.notifications.list failed: ${answer.problem.code}`);
  return notificationsListResultSchema.parse(answer.value).items;
}

export async function count(current: NotificationFixture, workspaceId?: string): Promise<NotificationsCountResult> {
  const answer = await current.fixture.runtime.query({
    sender: person, type: 'kernel.notifications.count',
    payload: workspaceId === undefined ? {} : { workspaceId },
    cause: undefined, workspaceId: undefined,
  });
  if (!answer.ok) throw new Error(`kernel.notifications.count failed: ${answer.problem.code}`);
  return notificationsCountResultSchema.parse(answer.value);
}

// The validation issue paths of a refused reply, so tests name the field admission stopped at.
export function issuePaths(problem: Problem): string[] {
  return (problem.issues ?? []).map((issue) => issue.path);
}

// herald.call as the person sends it: a kernel type called by the extension, answering { result } or { code }.
export function heraldCall(current: NotificationFixture, type: string, payload: Json, kind: 'command' | 'query'): Promise<ReplyPayload> {
  return command(current.fixture, 'herald.call', { type, payload, kind }, person, workspaceA);
}

// Every ui stream message pushed to S so far.
export function pushed(current: NotificationFixture): Array<SseMessage<'ui'>> {
  const pushes: Array<SseMessage<'ui'>> = [];
  for (const message of current.sink.messages) {
    if (message.event !== 'ui') continue;
    pushes.push(sseMessageSchemas.ui.parse(message.data));
  }
  return pushes;
}

// Every kernel.notifications.changed payload S received so far.
export function changes(current: NotificationFixture): Array<{ workspaceId?: string }> {
  const payloads: Array<{ workspaceId?: string }> = [];
  for (const message of current.sink.messages) {
    if (message.event !== 'event') continue;
    const parsed = sseMessageSchemas.event.parse(message.data);
    if (parsed.event.type !== 'kernel.notifications.changed') continue;
    payloads.push(notificationsChangedSchema.parse(parsed.event.payload));
  }
  return payloads;
}
