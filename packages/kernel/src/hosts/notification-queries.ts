import { notificationsCountRequestSchema, notificationsListRequestSchema, type Json } from '@kvman/protocol';
import { countTray, listTray } from '../notifications/tray-items.ts';
import type { Connection } from '../storage/driver.ts';

// kernel.notifications.list and .count (08 §8.11, ADR 0163); admission checked the payloads.
export class NotificationQueries {
  readonly #connection: Connection;
  readonly #now: () => number;

  constructor(connection: Connection, now: () => number) {
    this.#connection = connection;
    this.#now = now;
  }

  list(payload: Json): Json {
    const { workspaceId, unreadOnly } = notificationsListRequestSchema.parse(payload);
    return { items: listTray(this.#connection, { workspaceId, now: this.#now() }, unreadOnly === true) };
  }

  count(payload: Json): Json {
    const { workspaceId } = notificationsCountRequestSchema.parse(payload);
    return countTray(this.#connection, { workspaceId, now: this.#now() });
  }
}
