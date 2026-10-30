// Failures a second try may fix, kept apart from pi-ai so the catalog refresh (ADR 0110) can classify one without
// loading it. A second try may fix these (ADR 0009, 154 and 203): an HTTP 408, 409, 425, or 5xx (pi-ai's reason starts with the
// status), overloaded or unavailable providers, timeouts, and dropped or refused connections, a stream that ended before its final event (ADR 0050, 1), and a connection
// dropped while the answer was read, which reads `terminated` and nothing else (ADR 0069, 1).
const transientPattern = /^(?:408|409|425|5\d\d)\b|timed? ?out|timeout|connection error|econn(?:reset|refused|aborted)|etimedout|enotfound|eai_again|fetch failed|socket hang up|overloaded|service unavailable|bad gateway|stream ended|^terminated$/i;

/** Whether a provider's failure text is one a second try may fix. */
export const isTransient = (reason: string): boolean => transientPattern.test(reason);
