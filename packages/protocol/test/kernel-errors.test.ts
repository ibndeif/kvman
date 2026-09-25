import { describe, expect, it } from 'vitest';
import { kernelErrors } from '../src/index.ts';

const catalogOfPlan = [
  'VALIDATION_FAILED', 'TYPE_NOT_FOUND', 'HANDLER_UNAVAILABLE', 'NAMESPACE_CONFLICT', 'CAPABILITY_DENIED',
  'CALLER_NOT_ALLOWED', 'IDEMPOTENCY_MISMATCH', 'LANE_REENTRANT', 'DEADLINE_EXCEEDED', 'HANDLER_TIMEOUT', 'CANCELLED',
  'EFFECT_INDETERMINATE', 'MESSAGE_DEAD', 'STORAGE_CONFLICT', 'STORE_NOT_FOUND', 'STORE_RESULT_TOO_LARGE',
  'STEP_DUPLICATE', 'STORAGE_UNAVAILABLE', 'STORAGE_FULL', 'PAYLOAD_TOO_LARGE', 'QUERY_TIMEOUT', 'REPLY_NOT_AWAITING',
  'BLOB_NOT_FOUND', 'BLOB_TOO_LARGE', 'BLOB_UNSAFE_TYPE', 'WORKSPACE_INVALID', 'WORKSPACE_ESCAPE',
  'WORKSPACE_UNTRUSTED', 'CONFIG_INVALID', 'CONFIG_STALE', 'PRESET_INVALID', 'PRESET_UNSHAREABLE', 'PRESET_STALE',
  'PRESET_SECRET', 'PRESET_REFERENCE_MISSING', 'PRESET_REQUIRED', 'PRESET_INTEGRITY_MISMATCH', 'PRESET_READONLY',
  'ROUTE_CONFLICT', 'LLM_NOT_CONFIGURED', 'LLM_MODEL_NOT_FOUND', 'LLM_THINKING_UNSUPPORTED', 'LLM_CONTEXT_OVERFLOW',
  'LLM_CALL_FAILED', 'PROVIDER_CONFLICT', 'EXT_SOURCE_INVALID', 'EXT_INTEGRITY', 'EXT_MANIFEST_INVALID',
  'EXT_REQUIRES_MISSING', 'EXT_IN_USE', 'EXT_QUARANTINED', 'EXT_ROLLBACK_BLOCKED', 'EXT_GRANTS_REQUIRED',
  'SCHEMA_TOO_NEW', 'MIGRATION_FAILED', 'CONFIRMATION_EXPIRED', 'DAEMON_CONFLICT', 'HOME_INVALID', 'HOST_FORBIDDEN',
  'NOT_FOUND', 'PORT_UNAVAILABLE', 'KERNEL_STOPPING', 'INTERNAL',
];

const retryableByDefault = [
  'HANDLER_TIMEOUT', 'STORAGE_CONFLICT', 'STORAGE_UNAVAILABLE', 'QUERY_TIMEOUT', 'LLM_CALL_FAILED',
  'CONFIRMATION_EXPIRED', 'KERNEL_STOPPING', 'INTERNAL',
];

describe('kernel error catalog (plan 13 §13.2)', () => {
  it('M0.2-E14 the constants hold exactly the 63 codes (ADRs 0090, 0095), each with a title', () => {
    expect(Object.keys(kernelErrors).sort()).toEqual([...catalogOfPlan].sort());
    expect(catalogOfPlan).toHaveLength(63);
    for (const definition of Object.values(kernelErrors)) expect(definition.title.length).toBeGreaterThan(0);
  });

  it('M0.2-E15 the retryable column matches the plan', () => {
    const retryable = Object.entries(kernelErrors).filter(([, definition]) => definition.retryable).map(([code]) => code);
    expect(retryable.sort()).toEqual([...retryableByDefault].sort());
  });
});
