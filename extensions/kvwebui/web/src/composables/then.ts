import type { Json } from '@kvman/sdk';
import { resolveValues, type Scope } from '../contributions/references.ts';
import type { Then } from '../contributions/views.ts';
import { pageLocation } from '../state/navigation.ts';
import type { Kvwebui } from '../state/kvwebui.ts';

// What a button or form does after its command succeeds (plan 06 §6.4): rerun (already done by `runCommand`), navigate
// with `$output` references, or show a toast (level `success` by default).
export async function applyThen(state: Kvwebui, then: Then | undefined, output: Json, scope: Scope): Promise<void> {
  if (then === undefined || then === 'rerun') return;
  if ('navigate' in then) {
    await state.router.push(pageLocation(state.registry.value, then.navigate, resolveValues(then.params, { ...scope, output })));
    return;
  }
  state.toasts.show({ text: then.toast, params: {}, level: then.level ?? 'success' });
}
