// The kernel's limits (plan 02 §2.13).

const mebibyte = 1024 * 1024;

export const documentLimitBytes = 16 * mebibyte;

export const fileLimitBytes = 1024 * mebibyte;

export const findLimitMaximum = 1000;

export const progressLimitBytes = 64 * 1024;

export const progressReplayBytes = 256 * 1024;
