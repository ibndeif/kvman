// The time of a job id (ADR 0009, 87): job ids are UUIDv7, whose first 48 bits are the Unix time in milliseconds, taken
// from the kernel's clock when the job was made.
export function jobIdTime(jobId: string): number {
  return Number.parseInt(jobId.replaceAll('-', '').slice(0, 12), 16);
}
