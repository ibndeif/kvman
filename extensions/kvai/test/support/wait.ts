// How long a test waits for kvai's async work: each test boots a kernel, and the gates run many such kernels at once,
// so waits get a budget well past Vitest's 1 s default, as kvcoder's do.
export const wait = { timeout: 15_000, interval: 20 };
