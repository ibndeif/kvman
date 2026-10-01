// Job options of kvdev's commands (ADR 0009, 126): every command has `retries: 0`, since each runs a program that a
// retry would only run again; the long ones have their own timeouts.

export const jobOptions = {
  'kvdev.ext.new': { retries: 0, timeoutMs: 600_000 },
  'kvdev.ext.check': { retries: 0, timeoutMs: 300_000 },
  'kvdev.ext.test': { retries: 0, timeoutMs: 600_000 },
  'kvdev.preview.start': { retries: 0, timeoutMs: 300_000 },
  'kvdev.preview.stop': { retries: 0 },
  'kvdev.preset.new': { retries: 0 },
} as const;
