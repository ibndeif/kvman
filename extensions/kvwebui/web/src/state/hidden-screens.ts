import type { Json } from '@kvman/sdk';

// What a preset hides from people who aren't developers (plan 06 §6.2, ADR 0082, 12), and the port line of the
// Settings page (ADR 0082, 10).

/** The strings of a list setting's value; anything else counts as an empty list. */
export function stringList(value: Json | undefined): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
}

/** Whether the top bar shows the workspace picker: only `false` hides it. */
export function showsWorkspacePicker(value: Json | undefined): boolean {
  return value !== false;
}

/** The port this run listens on, when the page's own port isn't the `kernel.port` value; an empty port is the scheme's. */
export function portThisRun(locationPort: string, value: Json | undefined): number | undefined {
  if (!/^\d+$/.test(locationPort)) return undefined;
  const port = Number(locationPort);
  return port === value ? undefined : port;
}
