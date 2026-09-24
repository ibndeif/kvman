import { outboundPublishSchema, type Message } from '@kvman/protocol';
import type { EventDelivery, PublishAdmission, PublishRequest } from '../storage/commit-unit.ts';
import type { Subscriber } from '../registry/kernel-registry.ts';
import { checkPayload, refusalOf, resolveType, type AdmissionOptions } from './admission-context.ts';
import { requestDigestNow } from './idempotency.ts';
import { renderLane } from './lane-rendering.ts';
import { assignContext, assignPriority } from './message-assignment.ts';
import { checkPublish } from './permission-checks.ts';
import { Refusal } from './refusal.ts';

// A foreign event reaches a subscriber only when its subscription is granted (05 §5.7); own and kernel.* events
// need no grant.
function granted(options: AdmissionOptions, owner: string, event: Message, { extension, subscription }: Subscriber): boolean {
  if (extension === owner || event.type.startsWith('kernel.')) return true;
  return options.grants.capabilities(extension, event.workspaceId)?.derived.subscribes.includes(subscription.event) === true;
}

// One row per matching subscription (ADR 0053). A subscription lane that cannot be rendered fails only that
// delivery, never the publisher.
function delivery(options: AdmissionOptions, event: Message, { extension, subscription }: Subscriber): EventDelivery {
  const handler = `${extension}|subscription:${subscription.event}`;
  const base: Message = { ...event, id: options.ids.next(), causationId: event.id, idempotencyKey: `${event.id}:${handler}` };
  const rendering = subscription.lane === undefined ? undefined : renderLane(subscription.lane, event, 'lane');
  if (rendering !== undefined && !rendering.ok) {
    return { admitted: { message: base, handler }, problem: rendering.refusal.problem(event.correlationId) };
  }
  const message = rendering === undefined ? base : { ...base, lane: rendering.lane };
  const digest = requestDigestNow({
    type: message.type, payload: message.payload,
    ...(message.workspaceId === undefined ? {} : { workspaceId: message.workspaceId }), ...(message.lane === undefined ? {} : { lane: message.lane }),
  });
  return { admitted: { message, handler, digest } };
}

export function admitPublish(options: AdmissionOptions, request: PublishRequest): PublishAdmission {
  const id = options.ids.next();
  const { cause, sender } = request;
  const correlationId = cause?.correlationId ?? id;
  try {
    const parsed = outboundPublishSchema.safeParse(request.publish);
    if (!parsed.success) {
      throw new Refusal('VALIDATION_FAILED', { issues: parsed.error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message })) });
    }
    const { type, payload } = parsed.data;
    const resolved = resolveType(options, type, request.workspaceId, 'event');
    checkPublish(sender, resolved.owner, resolved.entry);
    const deliveryClass = resolved.entry.kind === 'event' ? resolved.entry.delivery : 'durable';
    checkPayload(options, resolved.entry.kind === 'event' ? resolved.entry.payload : undefined, payload);
    const event: Message = {
      v: 1, id, kind: 'event', type, source: sender.address,
      ...(resolved.workspaceId === undefined ? {} : { workspaceId: resolved.workspaceId }),
      payload, correlationId, ...(cause === undefined ? {} : { causationId: cause.id }),
      context: assignContext(cause, undefined, options.defaultLocale()), priority: assignPriority(sender, cause, undefined),
      delivery: deliveryClass, createdAt: options.now(),
    };
    if (deliveryClass !== 'durable') return { outcome: 'admitted', event, deliveries: [] };
    const subscribers = options.registry().subscribers(type, event.workspaceId).filter((subscriber) => granted(options, resolved.owner, event, subscriber));
    return { outcome: 'admitted', event, deliveries: subscribers.map((subscriber) => delivery(options, event, subscriber)) };
  } catch (error) {
    return { outcome: 'refused', problem: refusalOf(error).problem(correlationId) };
  }
}
