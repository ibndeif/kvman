import type { JsonObject, OutboundPublish, OutboundSend } from '@kvman/protocol';
import type { CommitResult, Sender, Submission } from '../../src/index.ts';
import { causeMessage, handlerUnit, kernel, ulids, workspaceA, type RouterFixture } from './harness.ts';

export const blob = 'a'.repeat(64);

function outcomeOf(result: CommitResult | Submission): string {
  if ('committed' in result) return result.committed ? 'ok' : result.problem.code;
  return result.ok ? 'ok' : result.problem.code;
}

// The outcome of one send by a handler of `extension`, each from a fresh invocation so derived keys never repeat.
export async function handlerSend(fixture: RouterFixture, extension: string, send: OutboundSend): Promise<string> {
  const causeType = extension === '@acme/pdf' ? 'pdf.import' : extension === '@acme/audit' ? 'audit.run' : 'agent.run';
  const cause = await causeMessage(fixture, causeType, kernel, causeType === 'pdf.import' ? { blobId: blob } : {});
  return outcomeOf(await handlerUnit(fixture, cause, extension, { sends: [send] }));
}

export async function handlerPublish(fixture: RouterFixture, extension: string, publish: OutboundPublish): Promise<string> {
  const causeType = extension === '@acme/pdf' ? 'pdf.import' : 'agent.run';
  const cause = await causeMessage(fixture, causeType, kernel, causeType === 'pdf.import' ? { blobId: blob } : {});
  return outcomeOf(await handlerUnit(fixture, cause, extension, { publishes: [publish] }));
}

export async function adapterSend(fixture: RouterFixture, sender: Sender, type: string, payload: JsonObject): Promise<string> {
  const key = sender.address === 'kernel' ? {} : { idempotencyKey: ulids.next() };
  return outcomeOf(await fixture.adapter.submitCommand({ sender, workspaceId: workspaceA, type, payload, ...key }));
}
