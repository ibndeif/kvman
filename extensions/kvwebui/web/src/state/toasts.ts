import { reactive } from 'vue';
import type { ToastLevel, Values } from '../contributions/views.ts';

// Toasts (ADR 0009, 75): `info` and `success` close after 5 s; `warning` and `error` stay until closed.

// `hint` is a second translated line, such as "Check the marked fields."
export type Toast = { id: number; text: string; params: Values; level: ToastLevel; hint?: string };

export type Toasts = {
  readonly list: readonly Toast[];
  show(toast: Omit<Toast, 'id'>): void;
  close(id: number): void;
};

export const toastMilliseconds = 5000;

export function createToasts(): Toasts {
  const list = reactive<Toast[]>([]);
  let nextId = 1;
  const close = (id: number): void => {
    const index = list.findIndex((toast) => toast.id === id);
    if (index >= 0) list.splice(index, 1);
  };
  return {
    list,
    show: (toast) => {
      const id = nextId++;
      list.push({ id, ...toast });
      if (toast.level === 'info' || toast.level === 'success') setTimeout(() => close(id), toastMilliseconds);
    },
    close,
  };
}
