// Job options of kvbuilder's commands (ADR 0009, 126): every command has `retries: 0`, since each runs a program that a
// retry would only run again; the long ones have their own timeouts.

export const jobOptions = {
  'kvbuilder.ext.new': { retries: 0, timeoutMs: 600_000 },
  'kvbuilder.ext.check': { retries: 0, timeoutMs: 300_000 },
  'kvbuilder.ext.test': { retries: 0, timeoutMs: 600_000 },
  'kvbuilder.preview.start': { retries: 0, timeoutMs: 300_000 },
  'kvbuilder.preview.stop': { retries: 0 },
  'kvbuilder.preview.command.run': { retries: 0, timeoutMs: 120_000 },
  'kvbuilder.preset.new': { retries: 0 },
  'kvbuilder.preset.check': { retries: 0, timeoutMs: 300_000 },
} as const;
