// 03 §3.6: an extension charged with 3 host crashes or stuck invocations within 10 minutes is quarantined.
export const hostFailureLimit = { count: 3, windowMs: 10 * 60_000 } as const;

export class HostFailures {
  readonly #charges = new Map<string, number[]>();

  // Charges one failure at `now`; true when it reaches the limit (the count starts again after a quarantine).
  charge(extension: string, now: number): boolean {
    const recent = (this.#charges.get(extension) ?? []).filter((at) => now - at < hostFailureLimit.windowMs);
    recent.push(now);
    if (recent.length < hostFailureLimit.count) {
      this.#charges.set(extension, recent);
      return false;
    }
    this.#charges.delete(extension);
    return true;
  }
}
