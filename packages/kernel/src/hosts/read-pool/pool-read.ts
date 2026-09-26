import type { Json, StoreRead } from '@kvman/protocol';
import type { StoreReader } from '../../store/store-reader.ts';

// One read of the read pool, for the owner and workspace the kernel chose (ADR 0131). An absent row reads as null.
export function servePoolRead(reader: StoreReader, owner: string, ws: string, read: StoreRead): Json {
  switch (read.op) {
    case 'kv.get':
      return reader.kvGet(owner, ws, read.key) ?? null;
    case 'kv.list':
      return reader.kvList(owner, ws, read.prefix, read.maxRows);
    case 'doc.get':
      return reader.documentGet(owner, ws, read.collection, read.id) ?? null;
    case 'doc.find':
      return reader.documentFind(owner, ws, read.collection, { where: read.where, orderBy: read.orderBy, limit: read.limit });
    case 'doc.count':
      return reader.documentCount(owner, ws, read.collection, read.where);
    case 'doc.matching-ids':
      return reader.matchingIds(owner, ws, read.collection, read.where, read.ids);
    case 'log.last-seq':
      return reader.logLastSeq(owner, ws, read.log);
    case 'log.read':
      return reader.logRead(owner, ws, read.log, read.after, read.before, read.maxRows);
    case 'log.read-newest':
      return reader.logReadNewest(owner, ws, read.log, read.after, read.before, read.count);
  }
}
