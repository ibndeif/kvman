import type { KernelErrorCode } from '@kvman/protocol';

const statusByCode: Partial<Record<KernelErrorCode, number>> = {
  VALIDATION_FAILED: 400,
  CAPABILITY_DENIED: 403,
  CALLER_NOT_ALLOWED: 403,
  HOST_FORBIDDEN: 403,
  TYPE_NOT_FOUND: 404,
  NOT_FOUND: 404,
  IDEMPOTENCY_MISMATCH: 409,
  PAYLOAD_TOO_LARGE: 413,
  BLOB_TOO_LARGE: 413,
  INTERNAL: 500,
  HANDLER_UNAVAILABLE: 503,
  STORAGE_UNAVAILABLE: 503,
  KERNEL_STOPPING: 503,
};

function isKernelCode(code: string): code is KernelErrorCode {
  return !code.includes('/');
}

// 12 §12.2, ADR 0094: every Problem an HTTP caller receives, refused or replied, has the status of its code; every
// kernel *_STALE and *_CONFLICT is 409, and every other code, extension codes included, is 422.
export function statusOf(code: string): number {
  if (!isKernelCode(code)) return 422;
  const listed = statusByCode[code];
  if (listed !== undefined) return listed;
  return code.endsWith('_STALE') || code.endsWith('_CONFLICT') ? 409 : 422;
}
