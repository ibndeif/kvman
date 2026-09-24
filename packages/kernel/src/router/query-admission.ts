import { jsonSchema, typeNameSchema, type Json, type Message, type Problem } from '@kvman/protocol';
import type { AdmittedMessage, Sender } from '../storage/commit-unit.ts';
import { checkPayload, refusalOf, resolveType, type AdmissionOptions } from './admission-context.ts';
import { assignContext, assignPriority } from './message-assignment.ts';
import { checkAccess, checkCallCapability } from './permission-checks.ts';
import { invalid } from './refusal.ts';

export type QueryRequest = { sender: Sender; type: string; payload: Json; cause: Message | undefined; workspaceId: string | undefined };

export type QueryAdmission = { ok: true; admitted: AdmittedMessage } | { ok: false; problem: Problem };

// 03 §3.3 step 7: a query is admitted like a command but never stored; it goes to the scheduler's priority path.
export function admitQuery(options: AdmissionOptions, request: QueryRequest): QueryAdmission {
  const id = options.ids.next();
  const { cause, sender } = request;
  const correlationId = cause?.correlationId ?? id;
  try {
    if (!typeNameSchema.safeParse(request.type).success) throw invalid('type', 'expected a message type such as "pdf.files.list"');
    if (!jsonSchema.safeParse(request.payload).success) throw invalid('payload', 'expected JSON');
    const resolved = resolveType(options, request.type, request.workspaceId, 'query');
    checkCallCapability(options.grants, sender, resolved.owner, resolved.entry, resolved.workspaceId);
    checkAccess(sender, resolved.owner, resolved.entry);
    checkPayload(options, resolved.entry.kind === 'query' ? resolved.entry.input : undefined, request.payload);
    const message: Message = {
      v: 1, id, kind: 'query', type: request.type, source: sender.address,
      ...(resolved.workspaceId === undefined ? {} : { workspaceId: resolved.workspaceId }),
      payload: request.payload, correlationId, ...(cause === undefined ? {} : { causationId: cause.id }),
      context: assignContext(cause, undefined, options.defaultLocale()), priority: assignPriority(sender, cause, undefined),
      createdAt: options.now(),
    };
    return { ok: true, admitted: { message, handler: resolved.owner } };
  } catch (error) {
    return { ok: false, problem: refusalOf(error).problem(correlationId) };
  }
}
