import type { Json, JsonObject } from '@kvman/protocol';
import type { Sender } from '../storage/commit-unit.ts';
import type { Connection } from '../storage/driver.ts';
import { blobIdsIn } from './blob-fields.ts';
import { holdsBlob } from './blob-rows.ts';

// 04 §4.6, ADR 0134: who may read a blob. People and the kernel read every blob; an extension (or a process acting for
// one) reads what it holds a reference to in any scope, and what its invocation received in a z.blobId() field. A
// blob that does not exist is refused like one it may not read, so a refusal tells nothing about others' blobs.
export class BlobRights {
  readonly #connection: Connection;
  readonly #now: () => number;

  constructor(connection: Connection, now: () => number) {
    this.#connection = connection;
    this.#now = now;
  }

  mayRead(sender: Sender, blobId: string, received: ReadonlySet<string>): boolean {
    if (sender.extension === undefined) return true;
    return received.has(blobId) || holdsBlob(this.#connection, sender.extension, blobId, this.#now());
  }

  // The first blob ID in a value's z.blobId() fields the sender may not read.
  unreadable(sender: Sender, schema: JsonObject | undefined, value: Json, received: ReadonlySet<string>): string | undefined {
    if (sender.extension === undefined) return undefined;
    return blobIdsIn(schema, value).find((blobId) => !this.mayRead(sender, blobId, received));
  }
}
