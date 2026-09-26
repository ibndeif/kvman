import type { JsonObject, Problem } from '@kvman/protocol';
import { kernelProblem } from '../problems.ts';
import { kernelOwner } from '../registry/kernel-types.ts';
import type { ReplyCheck, ResultCheck, Sender } from '../storage/commit-unit.ts';
import type { AdmissionOptions } from './admission-context.ts';

// A deferred reply's value is checked against its command's output schema, as a returned value is (ADR 0074).
function outputOf(options: AdmissionOptions, message: { type: string; workspaceId?: string }): JsonObject | undefined {
  const lookup = options.registry().lookup(message.type, message.workspaceId);
  return lookup.ok && lookup.resolved.entry.kind !== 'event' ? lookup.resolved.entry.output : undefined;
}

// ADR 0134: a result hands its z.blobId() fields over to whoever reads it, so each must be readable by its handler.
export function checkResult(options: AdmissionOptions, { message, value, extension, received }: ResultCheck): Problem | undefined {
  const handler: Sender = extension === kernelOwner ? { address: 'kernel' } : { address: `ext:${extension}`, extension };
  const blobId = options.blobs.unreadable(handler, outputOf(options, message), value, received);
  if (blobId === undefined) return undefined;
  return kernelProblem('CAPABILITY_DENIED', {
    correlationId: message.correlationId, messageId: message.id, detail: `the result names the blob ${blobId}, which ${extension} may not read`,
  });
}

export function checkReply(options: AdmissionOptions, { command, payload, replier, received }: ReplyCheck): Problem | undefined {
  if (!payload.ok) return undefined;
  const output = outputOf(options, command);
  if (output === undefined) return undefined;
  const issues = options.validators.issues(output, payload.value);
  if (issues.length > 0) return kernelProblem('VALIDATION_FAILED', { correlationId: command.correlationId, messageId: command.id, issues });
  return checkResult(options, { message: command, value: payload.value, extension: replier, received });
}
