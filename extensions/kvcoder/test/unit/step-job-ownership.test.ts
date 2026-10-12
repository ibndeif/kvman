import { describe, expect, it } from 'vitest';
import type { Job } from '@kvman/sdk';
import { ownsStepJob, type StepOwner } from '../../src/turns/cancel-step-job.ts';

const identity = { sessionId: 'session', turnId: 'turn', intentId: 'intent', generation: 7 };
const job: Job = { id: '01900000-0000-7000-8000-000000000001', name: 'kvcoder.turn.step', input: identity, workspaceId: 'workspace', caller: { kind: 'kernel' }, status: 'running', attempts: 1, retries: 0, createdAt: '2026-10-10T04:00:00.000Z' };
const owner: StepOwner = { sessionId: identity.sessionId, turnId: identity.turnId, jobId: job.id, identity };
const mismatches: Partial<Job>[] = [
  { id: 'other' }, { name: 'other.step' }, { workspaceId: 'other' },
  { input: { ...identity, sessionId: 'other' } }, { input: { ...identity, turnId: 'other' } },
  { input: { ...identity, intentId: 'other' } }, { input: { ...identity, generation: 8 } },
  { input: { ...identity, extra: true } }, { input: { ...identity, generation: 0 } },
  { input: { sessionId: identity.sessionId } }, { input: 'not an identity' },
];

describe('cancellation verifies immutable ownership, not replay eligibility (E79)', () => {
  it('accepts the exact modern owner, including terminal or previously attempted owned jobs', () => {
    expect(ownsStepJob(job, 'workspace', owner)).toBe(true);
    expect(ownsStepJob({ ...job, status: 'failed', attempts: 3, retries: 2 }, 'workspace', owner)).toBe(true);
  });
  it.each(mismatches)('rejects mismatched immutable job metadata %j', patch => {
    expect(ownsStepJob({ ...job, ...patch }, 'workspace', owner)).toBe(false);
  });
  it('requires a captured modern identity; a job ID or legacy defaults alone are not authority', () => {
    expect(ownsStepJob(job, 'workspace', { ...owner, identity: undefined })).toBe(false);
    expect(ownsStepJob(job, 'workspace', { ...owner, jobId: null })).toBe(false);
    expect(ownsStepJob(job, 'workspace', { ...owner, identity: { ...identity, sessionId: 'other' } })).toBe(false);
    expect(ownsStepJob(job, 'workspace', { ...owner, identity: { ...identity, turnId: 'other' } })).toBe(false);
  });
  it('accepts only the exact immutable saved legacy session/turn job, without granting replay', () => {
    const legacy: Job = { ...job, input: { sessionId: identity.sessionId, turnId: identity.turnId }, attempts: 2 };
    expect(ownsStepJob(legacy, 'workspace', { ...owner, identity: undefined })).toBe(true);
    expect(ownsStepJob({ ...legacy, input: { sessionId: 'other', turnId: identity.turnId } }, 'workspace', owner)).toBe(false);
    expect(ownsStepJob({ ...legacy, input: { sessionId: identity.sessionId, turnId: 'other' } }, 'workspace', owner)).toBe(false);
    expect(ownsStepJob({ ...legacy, workspaceId: 'other' }, 'workspace', owner)).toBe(false);
  });
});
