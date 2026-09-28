import {
  dismissSchema, navigateSchema, notificationSchema, toastSchema, type Manifest, type Message, type NoticeAction, type TypeEntry,
} from '@kvman/protocol';
import type { KernelRegistry } from '../registry/kernel-registry.ts';
import { kernelOwner } from '../registry/kernel-types.ts';
import type { SendRequest, Sender, UiSend } from '../storage/commit-unit.ts';
import { targetIssue, type TypeWorld } from '../ui/view-targets.ts';
import type { AdmissionOptions } from './admission-context.ts';
import { entityRoute } from './notice-entities.ts';
import { Refusal } from './refusal.ts';

export const uiTypes: ReadonlySet<string> = new Set(['ui.toast', 'ui.notify', 'ui.dismiss', 'ui.navigate']);

type Parsed<Value> = { success: true; data: Value } | { success: false; error: { issues: ReadonlyArray<{ path: PropertyKey[]; message: string }> } };

function parsed<Value>(result: Parsed<Value>): Value {
  if (result.success) return result.data;
  throw new Refusal('VALIDATION_FAILED', { issues: result.error.issues.map((issue) => ({ path: issue.path.map(String).join('.'), message: issue.message })) });
}

// 02 §2.4, ADR 0162: extensions and the kernel send ui.*; a person or a widget is refused by the type's access, and a
// process here, because a process is not an extension.
export function checkUiSender(sender: Sender, type: string): void {
  const { address } = sender;
  if (address === 'kernel' || address.startsWith('ext:')) return;
  throw new Refusal('CALLER_NOT_ALLOWED', { detail: `only extensions with the ui capability send "${type}"; ${address} may not` });
}

// The `ui` capability of the sender's grant in the unit's workspace, or the intersection for a global invocation
// (ADR 0133).
function checkCapability(options: AdmissionOptions, extension: string, workspaceId: string | undefined, type: string): void {
  const granted = options.grants.capabilities(extension, workspaceId)?.requested.some((capability) => capability.name === 'ui') === true;
  if (granted) return;
  throw new Refusal('CAPABILITY_DENIED', { detail: `${extension} may not send "${type}" without the ui capability`, hint: "add ext.requestCapability('ui', { reason })" });
}

// What a button may target: in a workspace, what the workspace resolves; in a global message only the sender's own
// types and the global ones, and nothing unresolved passes (the check fails closed).
function buttonWorld(registry: KernelRegistry, manifest: Manifest, workspaceId: string | undefined): TypeWorld {
  return {
    complete: true,
    resolve: (type) => {
      const own = workspaceId === undefined ? manifest.types.find((entry: TypeEntry) => entry.type === type) : undefined;
      if (own !== undefined) return { owner: manifest.meta.name, entry: own };
      const lookup = registry.lookup(type, workspaceId);
      return lookup.ok ? { owner: lookup.resolved.extension, entry: lookup.resolved.entry } : undefined;
    },
  };
}

// 08 §8.11: a button's click is the person's, so it is checked like a view action of the sender's (08 §8.7, ADR 0157),
// and never reaches another extension's `user` command.
function checkButtons(options: AdmissionOptions, extension: string, workspaceId: string | undefined, actions: readonly NoticeAction[]): void {
  const registry = options.registry();
  const manifest = registry.manifestOf(extension);
  if (manifest === undefined) throw new Refusal('CAPABILITY_DENIED', { detail: `${extension} is not installed` });
  const world = buttonWorld(registry, manifest, workspaceId);
  for (const action of actions) {
    if (!('command' in action)) continue;
    const refused = targetIssue(action.command, { as: 'command', payload: action.payload, generatedFields: false }, { kind: 'extension', manifest }, world);
    if (refused !== undefined) {
      throw new Refusal('CAPABILITY_DENIED', { detail: `a button may not send "${action.command}": ${refused.message}`, ...(refused.hint === undefined ? {} : { hint: refused.hint }) });
    }
    // 08 §8.11: unlike a view, a notification never offers another extension's `user` command, even one its calls cover.
    const target = world.resolve(action.command);
    if (target !== undefined && target.owner !== extension && target.owner !== kernelOwner && target.entry.kind === 'command' && target.entry.access === 'user') {
      throw new Refusal('CAPABILITY_DENIED', { detail: `a button may not send "${action.command}": it is another extension's command for people only` });
    }
  }
}

function extensionOf(request: SendRequest): string | undefined {
  return request.sender.address === 'kernel' ? undefined : request.sender.extension;
}

// ADR 0162: a ui.* send is checked in its unit's transaction in this order: the sender (checkUiSender), the payload,
// the `ui` capability, the buttons, the entity. The kernel's own sends skip the capability and the buttons.
export function checkUiSend(options: AdmissionOptions, request: SendRequest, message: Message): UiSend {
  const extension = extensionOf(request);
  const { workspaceId } = message;
  const guarded = (actions: readonly NoticeAction[]): void => {
    if (extension === undefined) return;
    checkCapability(options, extension, request.workspaceId, message.type);
    checkButtons(options, extension, workspaceId, actions);
  };
  if (message.type === 'ui.toast') {
    const toast = parsed(toastSchema.safeParse(message.payload));
    guarded(toast.action === undefined ? [] : [toast.action]);
    return { kind: 'toast', toast, entryId: options.ids.next() };
  }
  if (message.type === 'ui.notify') {
    const notification = parsed(notificationSchema.safeParse(message.payload));
    guarded(notification.actions ?? []);
    const { entity } = notification;
    if (entity === undefined) return { kind: 'notify', notification, entryId: options.ids.next() };
    if (notification.route !== undefined) {
      throw new Refusal('VALIDATION_FAILED', { issues: [{ path: 'route', message: 'a notification opens a route or an entity, not both' }] });
    }
    const route = entityRoute(options.registry(), entity, workspaceId, extension);
    return { kind: 'notify', notification: { ...notification, route }, entryId: options.ids.next() };
  }
  if (message.type === 'ui.dismiss') {
    const { key } = parsed(dismissSchema.safeParse(message.payload));
    guarded([]);
    return { kind: 'dismiss', key };
  }
  const { route } = parsed(navigateSchema.safeParse(message.payload));
  guarded([]);
  return { kind: 'navigate', route };
}
