import type { Subscriber } from '../registry/kernel-registry.ts';
import type { GrantsSource } from './grants.ts';

export type PublishedEvent = { type: string; owner: string; workspaceId: string | undefined };

// 05 §5.7: an extension receives its own events and kernel.* events without a grant; a foreign event only when its
// grant where the event is published derives that subscription (no inbox row without the grant).
export function receivesEvent(grants: GrantsSource, event: PublishedEvent, { extension, subscription }: Subscriber): boolean {
  if (extension === event.owner || event.type.startsWith('kernel.')) return true;
  return grants.capabilities(extension, event.workspaceId)?.derived.subscribes.includes(subscription.event) === true;
}
