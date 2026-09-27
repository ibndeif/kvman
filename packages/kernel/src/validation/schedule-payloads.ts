import type { Issue, Json } from '@kvman/protocol';
import { PayloadValidators } from '../router/payload-validators.ts';
import { arrayAt, objectOf, stringAt } from './json-reading.ts';
import { ownCommands } from './schedule-rules.ts';

const validators = new PayloadValidators();

// ADR 0144: each schedule's payload (default `{}`) matches its own command's input JSON Schema; checked where a manifest
// is validated on the kernel's main thread (install, kernel.validate).
export function schedulePayloadIssues(candidate: Json): Issue[] {
  const manifest = objectOf(candidate);
  if (manifest === undefined) return [];
  const commands = ownCommands(manifest);
  return arrayAt(manifest, 'schedules').flatMap((schedule, index) => {
    const command = stringAt(schedule, 'command');
    const input = command === undefined ? undefined : commands.get(command)?.input;
    if (input === undefined || commands.get(command ?? '')?.access === 'user') return [];
    const [first] = validators.issues(input, objectOf(schedule)?.['payload'] ?? {}, `schedules.${index}.payload`);
    return first === undefined ? [] : [{ ...first, hint: `give the schedule a payload that ${command} accepts` }];
  });
}
