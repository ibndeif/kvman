import type { Issue, Json } from '@kvman/protocol';
import { objectOf, stringAt } from '../validation/json-reading.ts';
import type { UiSite } from './ui-sites.ts';
import type { UiWorld } from './ui-world.ts';
import { checkValue, type ValueChecker } from './value-checks.ts';
import { targetIssue, type TargetUse, type ViewAuthor } from './view-targets.ts';

// A place in a view that sends a type as the person: where the type is named, how it is sent, and its payload.
type Send = { path: string; type: string; use: TargetUse; payloadPath: string | undefined };

function sendsOf(site: UiSite): Send[] {
  const sends: Send[] = [];
  for (const fact of site.facts) {
    if (fact.kind === 'action') {
      const action = objectOf(fact.action);
      const command = stringAt(action, 'command');
      if (action === undefined || command === undefined) continue;
      const form = action['form'];
      sends.push({
        path: `${fact.path}.command`, type: command, payloadPath: `${fact.path}.payload`,
        use: { as: 'command', payload: action['payload'], generatedFields: form !== undefined && form !== false },
      });
    } else if (fact.kind === 'node' && fact.type === 'form') {
      const command = stringAt(fact.node, 'command');
      if (command !== undefined) sends.push({ path: `${fact.path}.command`, type: command, payloadPath: undefined, use: { as: 'command', payload: undefined, generatedFields: true } });
    }
  }
  for (const read of site.reads) {
    sends.push({ path: read.path, type: read.query, payloadPath: read.payloadPath, use: { as: 'query', payload: read.payload, generatedFields: false } });
  }
  return sends;
}

function payloadIssues(send: Send, input: Json, values: ValueChecker | undefined): Issue[] {
  if (send.payloadPath === undefined) return [];
  const value = send.use.payload ?? {};
  return checkValue(values, { schema: objectOf(input) ?? {}, value, root: send.payloadPath, missingAllowed: send.use.generatedFields });
}

// 08 §8.7, ADR 0157: every type a view sends is one its author may put before the person, and its literal payload
// fits the type's input (bindings pass; a command with `form` leaves missing fields to the form).
export function targetIssues(site: UiSite, world: UiWorld, author: ViewAuthor, values: ValueChecker | undefined): Issue[] {
  return sendsOf(site).flatMap((send): Issue[] => {
    const refused = targetIssue(send.type, send.use, author, world);
    if (refused !== undefined) return [{ path: send.path, ...refused }];
    const entry = world.resolve(send.type)?.entry;
    if (entry === undefined || entry.kind === 'event') return [];
    return payloadIssues(send, entry.input, values);
  });
}
