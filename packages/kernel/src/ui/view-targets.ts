import { matchesTypePattern, type Issue, type Json, type Manifest, type TypeEntry } from '@kvman/protocol';
import { kernelTypeEntries } from '../registry/kernel-types.ts';
import { objectOf } from '../validation/json-reading.ts';
import { kernelSenders } from './kernel-senders.ts';

// Whose view it is: an extension's (its own types, its requested `calls`, and kernel types by its capabilities) or
// the workspace preset's (every `all`/`user` type of the enabled extensions and the kernel queries open to all).
export type ViewAuthor = { kind: 'extension'; manifest: Manifest } | { kind: 'preset' };

// The types the view may resolve: in a manifest's own check only its own; against a workspace the enabled set.
export type TypeWorld = { resolve(type: string): { owner: string; entry: TypeEntry } | undefined; complete: boolean };

// A command action may send a command; a declared query, badge, or slash menu reads a query; a form node submits
// generated fields, so it may add any field of the input.
export type TargetUse = { as: 'command' | 'query'; payload: Json | undefined; generatedFields: boolean };

const kernelEntries = new Map(kernelTypeEntries().map((entry) => [entry.type, entry]));

function holdsAdmin(author: ViewAuthor): boolean {
  return author.kind === 'extension' && author.manifest.permissions.capabilities.some((capability) => capability.name === 'kernel.admin');
}

function callPatterns(manifest: Manifest): string[] {
  return manifest.permissions.capabilities.flatMap((capability) => (capability.name === 'calls' ? capability.types ?? [] : []));
}

// `kernel.extension.reload` with `grants` and `kernel.preset.update` touching `extensions` grant power (08 §8.7):
// as a plain command they pass only when their literal payload shows neither and no form can add it.
function grantsPower(type: string, use: TargetUse): boolean {
  if (use.generatedFields) return true;
  const payload = objectOf(use.payload ?? {});
  if (payload === undefined) return true;
  if (type === 'kernel.extension.reload') return payload['grants'] !== undefined;
  if (type === 'kernel.preset.update') {
    const patch = objectOf(payload['patch'] ?? null);
    return patch === undefined || patch['extensions'] !== undefined;
  }
  return true;
}

const conditionalGrants = new Set(['kernel.extension.reload', 'kernel.preset.update']);

function kindIssue(type: string, entry: TypeEntry, use: TargetUse): string | undefined {
  if (entry.kind === use.as) return undefined;
  return `${type} is ${entry.kind === 'event' ? 'an event' : `a ${entry.kind}`}; this place sends a ${use.as}`;
}

function kernelTarget(type: string, use: TargetUse, author: ViewAuthor): Omit<Issue, 'path'> | undefined {
  const entry = kernelEntries.get(type);
  const sender = kernelSenders.get(type);
  if (entry === undefined || sender === undefined) return { message: `${type} is not a kernel type`, hint: 'use a kernel type listed by kernel.schema.get' };
  const wrongKind = kindIssue(type, entry, use);
  if (wrongKind !== undefined) return { message: wrongKind };
  if (sender === 'any') return undefined;
  if (author.kind === 'preset') return { message: `a preset page may send only the kernel queries open to all; ${type} is not one` };
  if (sender === 'llm') return { message: `${type} calls models, which a person's view cannot do`, hint: 'call models from a handler with ctx.llm' };
  const powered = sender === 'grant' && (!conditionalGrants.has(type) || grantsPower(type, use));
  if (powered) return { message: `${type} grants power and is confirmed only in the grant dialog`, hint: `use { "openGrantDialog": { "command": "${type}", "payload": … } }` };
  if (!holdsAdmin(author)) return { message: `${type} is for administrators`, hint: "request ext.requestCapability('kernel.admin') to offer it" };
  return undefined;
}

// After the kind check, so an event never reaches here.
function accessOf(entry: TypeEntry): string {
  return entry.kind === 'event' ? 'event' : entry.access;
}

// 08 §8.7, 06 §6.3, ADR 0157: the sender of a view's commands and queries is the person, so a view never targets an
// `extensions` or `internal` type, and only what its author may put in front of a person. `undefined` means allowed,
// or not decidable yet (a foreign type in a manifest's own check, left to the workspace check).
export function targetIssue(type: string, use: TargetUse, author: ViewAuthor, world: TypeWorld): Omit<Issue, 'path'> | undefined {
  if (type.startsWith('kernel.')) return kernelTarget(type, use, author);
  const own = author.kind === 'extension' && type.startsWith(`${author.manifest.meta.namespace}.`);
  if (author.kind === 'extension' && !own && !callPatterns(author.manifest).some((pattern) => matchesTypePattern(pattern, type))) {
    return { message: `${type} is another extension's; its calls are not requested`, hint: `add ext.requestCapability('calls', { types: ['${type}'] })` };
  }
  const found = world.resolve(type);
  if (found === undefined) {
    if (!own && !world.complete) return undefined;
    return { message: `${type} is not ${own ? 'registered' : 'provided in this workspace'}` };
  }
  const wrongKind = kindIssue(type, found.entry, use);
  if (wrongKind !== undefined) return { message: wrongKind };
  const access = accessOf(found.entry);
  if (access !== 'all' && access !== 'user') {
    return { message: `${type} has access "${access}"; a view's sender is the person`, hint: 'target a type with access "all" or "user"' };
  }
  return undefined;
}
