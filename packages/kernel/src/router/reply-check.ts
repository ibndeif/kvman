import type { Problem } from '@kvman/protocol';
import { kernelProblem } from '../problems.ts';
import type { ReplyCheck } from '../storage/commit-unit.ts';
import type { AdmissionOptions } from './admission-context.ts';

// A deferred reply's value is checked against its command's output schema, as a returned value is (ADR 0074).
export function checkReply(options: AdmissionOptions, { command, payload }: ReplyCheck): Problem | undefined {
  if (!payload.ok) return undefined;
  const lookup = options.registry().lookup(command.type, command.workspaceId);
  const output = lookup.ok && lookup.resolved.entry.kind === 'command' ? lookup.resolved.entry.output : undefined;
  if (output === undefined) return undefined;
  const issues = options.validators.issues(output, payload.value);
  return issues.length === 0 ? undefined : kernelProblem('VALIDATION_FAILED', { correlationId: command.correlationId, messageId: command.id, issues });
}
