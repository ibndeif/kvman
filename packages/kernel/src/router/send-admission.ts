import { outboundSendSchema, type Message, type OutboundSend } from '@kvman/protocol';
import type { SendAdmission, SendRequest } from '../storage/commit-unit.ts';
import type { Connection } from '../storage/driver.ts';
import { checkPayload, refusalOf, resolveType, type AdmissionOptions, type Resolved } from './admission-context.ts';
import { findKeyedMessage, requestDigestNow } from './idempotency.ts';
import { renderLane } from './lane-rendering.ts';
import { assignContext, assignNotBefore, assignPriority } from './message-assignment.ts';
import { checkAccess, checkCallCapability } from './permission-checks.ts';
import { invalid, Refusal } from './refusal.ts';

function checkEnvelope(request: SendRequest): void {
  const parsed = outboundSendSchema.safeParse(request.send);
  if (!parsed.success) {
    throw new Refusal('VALIDATION_FAILED', { issues: parsed.error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message })) });
  }
  const { address } = request.sender;
  if (request.send.idempotencyKey === undefined && (address.startsWith('user:') || address.startsWith('proc:'))) {
    throw invalid('idempotencyKey', 'commands from people and processes carry an idempotency key');
  }
}

// 06 §6.3: a continuation is one of the sender's own internal commands (ADR 0058).
function checkContinuation(options: AdmissionOptions, request: SendRequest): void {
  const { onReply } = request.send;
  if (onReply === undefined) return;
  const hint = 'a continuation is one of your own internal commands';
  const lookup = options.registry().lookup(onReply.type, request.workspaceId);
  const own = lookup.ok && lookup.resolved.entry.kind === 'command' && lookup.resolved.entry.access === 'internal'
    && request.sender.address === `ext:${lookup.resolved.extension}`;
  if (!own) throw invalid('onReply.type', `"${onReply.type}" is not an internal command of the sender`, hint);
}

function baseMessage(options: AdmissionOptions, request: SendRequest, id: string): Message {
  const { send, sender, cause } = request;
  const now = options.now();
  const notBefore = assignNotBefore(send, now);
  return {
    v: 1, id, kind: 'command', type: send.type, source: sender.address,
    ...(request.workspaceId === undefined ? {} : { workspaceId: request.workspaceId }),
    payload: send.payload, correlationId: cause?.correlationId ?? id,
    ...(cause === undefined ? {} : { causationId: cause.id }),
    context: assignContext(cause, send.context, options.defaultLocale()),
    ...(send.onReply === undefined ? {} : { onReply: send.onReply }),
    priority: assignPriority(sender, cause, send.priority),
    ...(send.deadlineAt === undefined ? {} : { deadlineAt: send.deadlineAt }),
    ...(notBefore === undefined ? {} : { notBefore }),
    createdAt: now,
  };
}

// ADR 0065: a handler's declared priority stands in for a request the sender did not make, capped the same way.
function withHandlerPriority(resolved: Resolved, request: SendRequest, message: Message): Message {
  const declared = resolved.entry.kind === 'command' ? resolved.entry.priority : undefined;
  if (declared === undefined || request.send.priority !== undefined) return message;
  return { ...message, priority: assignPriority(request.sender, request.cause, declared) };
}

function laneOf(resolved: Resolved, send: OutboundSend, message: Message): string | undefined {
  const template = resolved.entry.kind === 'command' ? resolved.entry.lane : undefined;
  if (template === undefined) return send.lane;
  if (send.lane !== undefined) throw invalid('lane', 'this handler declares its lane', `remove the lane; "${resolved.entry.type}" renders ${template}`);
  const rendering = renderLane(template, message, 'lane');
  if (!rendering.ok) throw rendering.refusal;
  return rendering.lane;
}

// 02 §2.7: people and processes bring a key; a handler's send without one gets <invocation>:send:<index>.
function idempotencyKeyOf(request: SendRequest): string | undefined {
  if (request.send.idempotencyKey !== undefined) return request.send.idempotencyKey;
  return request.sender.address.startsWith('ext:') && request.cause !== undefined ? `${request.cause.id}:send:${request.index}` : undefined;
}

function withoutKey(message: Message): Message {
  const { idempotencyKey: _key, ...rest } = message;
  return rest;
}

// 03 §3.3 steps 1–6 for a command. Failures before the message exists reject the unit; later failures return the
// message as a failed row, so a send with onReply can deliver its failure (ADR 0034, 0057).
export function admitSend(options: AdmissionOptions, connection: Connection, request: SendRequest): SendAdmission {
  const id = request.id ?? options.ids.next();
  const correlationId = request.cause?.correlationId ?? id;
  let message: Message;
  try {
    checkEnvelope(request);
    checkContinuation(options, request);
    message = baseMessage(options, request, id);
  } catch (error) {
    return { outcome: 'refused', problem: refusalOf(error).problem(correlationId) };
  }
  let owner = '';
  try {
    const resolved = resolveType(options, message.type, request.workspaceId, 'command');
    owner = resolved.owner;
    const { workspaceId: _requested, ...unscoped } = message;
    message = withHandlerPriority(resolved, request, resolved.workspaceId === undefined ? unscoped : { ...unscoped, workspaceId: resolved.workspaceId });
    checkCallCapability(options.grants, request.sender, owner, resolved.entry, resolved.workspaceId);
    checkAccess(request.sender, owner, resolved.entry);
    checkPayload(options, resolved.entry.kind === 'command' ? resolved.entry.input : undefined, message.payload);
    const lane = laneOf(resolved, request.send, message);
    if (lane !== undefined) message = { ...message, lane };
    const key = idempotencyKeyOf(request);
    const digest = requestDigestNow({ type: message.type, payload: message.payload, ...(resolved.workspaceId === undefined ? {} : { workspaceId: resolved.workspaceId }), ...(lane === undefined ? {} : { lane }) });
    if (key === undefined) return { outcome: 'admitted', admitted: { message, handler: owner, digest } };
    message = { ...message, idempotencyKey: key };
    const existing = findKeyedMessage(connection, message.source, key);
    if (existing === undefined) return { outcome: 'admitted', admitted: { message, handler: owner, digest } };
    if (existing.digest === digest) {
      const { digest: _stored, ...original } = existing;
      return { outcome: 'duplicate', original };
    }
    throw new Refusal('IDEMPOTENCY_MISMATCH', { detail: `the key "${key}" was used for a different request (${existing.id})` });
  } catch (error) {
    const refusal = refusalOf(error);
    const row = refusal.code === 'IDEMPOTENCY_MISMATCH' ? withoutKey(message) : message;
    return { outcome: 'refused', problem: refusal.problem(correlationId), failed: { message: row, handler: owner } };
  }
}
