import type { Issue, JsonObject } from '@kvman/protocol';
import { parseCron } from '../schedules/cron.ts';
import { arrayAt, objectOf, stringAt } from './json-reading.ts';

export type OwnCommand = { access: string | undefined; input: JsonObject | undefined };

export function ownCommands(manifest: JsonObject): Map<string, OwnCommand> {
  return new Map(arrayAt(manifest, 'types').flatMap((entry) => {
    const type = stringAt(entry, 'type');
    if (type === undefined || stringAt(entry, 'kind') !== 'command') return [];
    return [[type, { access: stringAt(entry, 'access'), input: objectOf(objectOf(entry)?.['input']) }]];
  }));
}

function commandIssues(path: string, command: string | undefined, commands: ReadonlyMap<string, OwnCommand>): Issue[] {
  if (command === undefined) return [];
  const own = commands.get(command);
  if (own === undefined) {
    return [{ path: `${path}.command`, message: `"${command}" is not one of this extension's commands`, hint: 'a schedule sends one of its own commands; register it with ext.registerCommand' }];
  }
  if (own.access === 'user') {
    return [{ path: `${path}.command`, message: `"${command}" has access "user", and schedule runs come from the kernel`, hint: "give the command access 'internal' (the usual choice for schedules)" }];
  }
  return [];
}

// ADR 0144: a schedule sends one of its own commands, not a user-only one, and a cron expression that parses and can
// match. Its payload is checked against the command's input on the kernel's main thread (schedule-payloads.ts), because
// hosts and the loader validate manifests without a JSON Schema validator.
export function scheduleIssues(manifest: JsonObject): Issue[] {
  const commands = ownCommands(manifest);
  return arrayAt(manifest, 'schedules').flatMap((schedule, index) => {
    const path = `schedules.${index}`;
    const issues = commandIssues(path, stringAt(schedule, 'command'), commands);
    const cron = stringAt(schedule, 'cron');
    const parsed = cron === undefined ? undefined : parseCron(cron);
    if (parsed !== undefined && !parsed.ok) issues.push({ path: `${path}.cron`, message: parsed.issue.message, hint: parsed.issue.hint });
    return issues;
  });
}
