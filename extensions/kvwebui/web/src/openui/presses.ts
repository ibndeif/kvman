import { ACTION_STEPS } from '@openuidev/lang-core';
import type { ActionEvent } from '@openuidev/vue-lang';
import { computed, inject, provide, ref, type ComputedRef, type InjectionKey, type Ref } from 'vue';

// What a press in OpenUI may do (plan 06 §6.1, ADR 0124, 3, 6, 14, 18): a press sends a message only when the host gave
// `View` an `onMessage`, and only while the block is live (not streaming and with a handler).

/** The message handler the host gave `View`, if any. */
export const openuiMessageKey: InjectionKey<Readonly<Ref<((text: string) => void) | undefined>>> = Symbol('kvwebui-openui-message');

const openuiLiveKey: InjectionKey<Readonly<Ref<boolean>>> = Symbol('kvwebui-openui-live');

/** Provides whether presses in this block may act. */
export function provideOpenuiLive(live: Readonly<Ref<boolean>>): void {
  provide(openuiLiveKey, live);
}

/** Whether presses in this block may act. */
export function useOpenuiLive(): ComputedRef<boolean> {
  const live = inject(openuiLiveKey, ref(false));
  return computed(() => live.value);
}

/** Whether an action sends a message: it has no steps (a button with no action sends its label), or a `@ToAssistant` step. */
export function sendsToAssistant(action: unknown): boolean {
  if (typeof action !== 'object' || action === null || !('steps' in action) || !Array.isArray(action.steps)) return true;
  return action.steps.some((step: unknown) => typeof step === 'object' && step !== null && 'type' in step && step.type === ACTION_STEPS.ToAssistant);
}

/** A card block's action for one card: each @ToAssistant step sends its text, a blank line, and the card's label, so
 * the message says which card was pressed (OpenUI passes it as hidden context, which a person's message has none of). */
export function withCardLabel(action: unknown, label: string): unknown {
  if (typeof action !== 'object' || action === null || !('steps' in action) || !Array.isArray(action.steps)) return action;
  const steps = action.steps.map((step: unknown) => {
    if (typeof step !== 'object' || step === null || !('type' in step) || step.type !== ACTION_STEPS.ToAssistant || !('message' in step)) return step;
    return { ...step, message: `${String(step.message)}\n\n${label}` };
  });
  return { ...action, steps };
}

/** The block's forms, by name: each gives the `<label>: <value>` lines of its controls, in order (ADR 0124, 14). */
export const formMessagesKey: InjectionKey<Map<string, () => string[]>> = Symbol('kvwebui-openui-form-messages');

/** The message a press sends, or `undefined` for an action that sends nothing: a form's press adds its lines. */
export function messageOf(event: ActionEvent, forms: ReadonlyMap<string, () => string[]>): string | undefined {
  if (event.type !== 'continue_conversation') return undefined;
  const lines = event.formName === undefined ? [] : (forms.get(event.formName)?.() ?? []);
  return lines.length === 0 ? event.humanFriendlyMessage : `${event.humanFriendlyMessage}\n\n${lines.join('\n')}`;
}
