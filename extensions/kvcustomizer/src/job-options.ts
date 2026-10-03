// Job options of kvcustomizer's commands (ADR 0009, 126): every command has `retries: 0`, since each runs a program that a
// retry would only run again; the long ones have their own timeouts.

export const jobOptions = {
  'kvcustomizer.ext.new': { retries: 0, timeoutMs: 600_000 },
  'kvcustomizer.ext.check': { retries: 0, timeoutMs: 300_000 },
  'kvcustomizer.ext.test': { retries: 0, timeoutMs: 600_000 },
  'kvcustomizer.preview.start': { retries: 0, timeoutMs: 300_000 },
  'kvcustomizer.preview.stop': { retries: 0 },
  'kvcustomizer.preset.new': { retries: 0 },
  'kvcustomizer.preset.check': { retries: 0, timeoutMs: 300_000 },
} as const;
