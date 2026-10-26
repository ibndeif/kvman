// Whether a kvman is new enough (plan 15 §15.3, ADR 0106, 4): at least as new as this extension, since the two are
// released together at the root version.

type Version = readonly [number, number, number];

/** The first `major.minor.patch` in a `--version` output, or undefined when it has none. */
export function versionIn(output: string): string | undefined {
  return /(\d+)\.(\d+)\.(\d+)/.exec(output)?.[0];
}

function parts(version: string): Version {
  const [major = 0, minor = 0, patch = 0] = version.split('.').map(Number);
  return [major, minor, patch];
}

function compare(left: string, right: string): number {
  const [a, b] = [parts(left), parts(right)];
  return a[0] - b[0] || a[1] - b[1] || a[2] - b[2];
}

export function isNewEnough(version: string, extensionVersion: string): boolean {
  return compare(version, extensionVersion) >= 0;
}
