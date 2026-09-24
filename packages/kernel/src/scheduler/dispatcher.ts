import type { Message, MessageKind } from '@kvman/protocol';

export type DispatchTarget = { extension: string; workspaceId: string | undefined; kind: MessageKind };

// A host's current load as its host manager reports it (ADR 0060).
export type HostLoad = { host: string; inFlight: number; cap: number };

// One run of a handler: the stored message, the extension and handler function that run it, and the run number.
export type Claim = { message: Message; extension: string; handler: string; attempt: number };

// How the scheduler reaches execution hosts (ADR 0060). The host manager counts its own in-flight invocations; the
// scheduler keeps the share reserved for queries and hands over claimed messages.
export interface Dispatcher {
  load(target: DispatchTarget): HostLoad;
  dispatch(claim: Claim): void;
}

export const queryShare = 0.25;

// Commands and event deliveries leave a quarter of every host to queries (03 §3.4).
export function commandSlots(cap: number): number {
  return Math.floor(cap * (1 - queryShare));
}
