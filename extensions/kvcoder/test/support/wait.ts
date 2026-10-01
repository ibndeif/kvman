// How long a test waits for kvcoder's async work: each test boots kvai, kvwebui, and kvcoder in a kernel, and the gates
// run many such kernels at once, so waits get a budget well past Vitest's 1 s default (plan 12 §12.1).
export const wait = { timeout: 15_000, interval: 20 };
