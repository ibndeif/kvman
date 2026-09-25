import { kernelErrors } from '@kvman/protocol';
import { describe, expect, it } from 'vitest';
import { statusOf } from '../../src/index.ts';

const listed: Record<string, number> = {
  VALIDATION_FAILED: 400, CAPABILITY_DENIED: 403, CALLER_NOT_ALLOWED: 403, HOST_FORBIDDEN: 403, TYPE_NOT_FOUND: 404, NOT_FOUND: 404,
  IDEMPOTENCY_MISMATCH: 409, STORAGE_CONFLICT: 409, CONFIG_STALE: 409, PRESET_STALE: 409, NAMESPACE_CONFLICT: 409, ROUTE_CONFLICT: 409,
  PROVIDER_CONFLICT: 409, DAEMON_CONFLICT: 409, PAYLOAD_TOO_LARGE: 413, BLOB_TOO_LARGE: 413, INTERNAL: 500,
  HANDLER_UNAVAILABLE: 503, STORAGE_UNAVAILABLE: 503, KERNEL_STOPPING: 503,
};

describe('HTTP statuses (plan 12 §12.2, ADR 0094)', () => {
  it('M1.8-E32 every code maps to its status', () => {
    for (const code of Object.keys(kernelErrors)) expect([code, statusOf(code)]).toEqual([code, listed[code] ?? 422]);
    for (const code of ['CANCELLED', 'DEADLINE_EXCEEDED', 'MESSAGE_DEAD', 'HANDLER_TIMEOUT', 'QUERY_TIMEOUT', 'LANE_REENTRANT']) expect(statusOf(code)).toBe(422);
    expect(statusOf('counter/NEGATIVE')).toBe(422);
    expect(statusOf('pdf/EDIT_CONFLICT')).toBe(422);
  });
});
