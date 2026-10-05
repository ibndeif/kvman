import { onBeforeUnmount, watch } from 'vue';

// A menu closes on a press outside it and on Escape (ADR 0017, 8). `root` holds the menu and its button.
export function useDismiss(open: () => boolean, root: () => HTMLElement | null, close: () => void): void {
  const outside = (event: Event): void => {
    if (event.target instanceof Node && root()?.contains(event.target) !== true) close();
  };
  const escape = (event: KeyboardEvent): void => {
    if (event.key === 'Escape') close();
  };
  const stop = (): void => {
    document.removeEventListener('pointerdown', outside);
    document.removeEventListener('keydown', escape);
  };
  watch(open, (isOpen) => {
    stop();
    if (!isOpen) return;
    document.addEventListener('pointerdown', outside);
    document.addEventListener('keydown', escape);
  });
  onBeforeUnmount(stop);
}
