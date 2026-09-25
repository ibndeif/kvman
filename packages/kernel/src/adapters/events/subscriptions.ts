import { matchesTypePattern, type SseMessage, type SubscriptionRequestBody } from '@kvman/protocol';
import type { LiveFrame } from '../../hosts/live-bus.ts';

export type StreamedEvent = SseMessage<'event'>['event'];

// One subscription of a stream (12 §12.3): event type patterns, live addresses, and an optional workspace.
export type Subscription = { sid: string; events: readonly string[]; live: readonly string[]; workspaceId: string | undefined };

export function subscriptionOf(request: SubscriptionRequestBody): Subscription {
  return { sid: request.sid, events: request.events ?? [], live: request.live ?? [], workspaceId: request.workspaceId };
}

// ADR 0098: a subscription with a workspace receives that workspace's messages and global ones; without, every one.
function inScope(subscription: Subscription, workspaceId: string | undefined): boolean {
  return subscription.workspaceId === undefined || workspaceId === undefined || workspaceId === subscription.workspaceId;
}

export function matchesEvent(subscription: Subscription, event: StreamedEvent): boolean {
  return inScope(subscription, event.workspaceId) && subscription.events.some((pattern) => matchesTypePattern(pattern, event.type));
}

export function matchesLive(subscription: Subscription, frame: LiveFrame): boolean {
  return inScope(subscription, frame.workspaceId) && subscription.live.includes(`${frame.type}:${frame.key}`);
}
