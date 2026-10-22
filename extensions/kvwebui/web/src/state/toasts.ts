import { reactive } from 'vue';
import type { ToastLevel, Values } from '../contributions/views.ts';

// Toasts (ADR 0009, 75): `info` and `success` close after 5 s; `warning` and `error` stay until closed. A toast like one
// that is open isn't added again (ADR 0101, 14).

// `hint` is a second translated line, such as "Check the marked fields."
export type Toast = { id: number; text: string; params: Values; level: ToastLevel; hint?: string };

export type Toasts = {
  readonly list: readonly Toast[];
  show(toast: Omit<Toast, 'id'>): void;
  close(id: number): void;
};

export const toastMilliseconds = 5000;

const sameToast = (open: Toast, toast: Omit<Toast, 'id'>): boolean =>
  open.text === toast.text && open.level === toast.level && open.hint === toast.hint && JSON.stringify(open.params) === JSON.stringify(toast.params);

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
      if (list.some((open) => sameToast(open, toast))) return;
      const id = nextId++;
      list.push({ id, ...toast });
      if (toast.level === 'info' || toast.level === 'success') setTimeout(() => close(id), toastMilliseconds);
    },
    close,
  };
}
