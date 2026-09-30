import { shallowRef, type ShallowRef } from 'vue';
import type { Values } from '../contributions/views.ts';

// A button's `confirm` (ADR 0009, 75): an in-app dialog that answers yes or no.

export type Confirmation = { text: string; params: Values; danger: boolean; answer: (confirmed: boolean) => void };

export type Confirmations = {
  readonly current: ShallowRef<Confirmation | undefined>;
  ask(text: string, params: Values, danger: boolean): Promise<boolean>;
};

export function createConfirmations(): Confirmations {
  const current = shallowRef<Confirmation | undefined>();
  return {
    current,
    ask: (text, params, danger) =>
      new Promise((resolve) => {
        current.value = {
          text,
          params,
          danger,
          answer: (confirmed) => {
            current.value = undefined;
            resolve(confirmed);
          },
        };
      }),
  };
}
