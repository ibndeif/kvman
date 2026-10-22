import { onBeforeUnmount, watch } from 'vue';

// A menu closes on a press outside it, on Escape (ADR 0017, 8), and when the focus moves outside it, so opening another
// menu from the keyboard closes this one (ADR 0101, 15). `root` holds the menu and its button.
export function useDismiss(open: () => boolean, root: () => HTMLElement | null, close: () => void): void {
  const outside = (event: Event): void => {
    if (event.target instanceof Node && root()?.contains(event.target) !== true) close();
  };
  const escape = (event: KeyboardEvent): void => {
    if (event.key === 'Escape') close();
  };
  const stop = (): void => {
    document.removeEventListener('pointerdown', outside);
    document.removeEventListener('focusin', outside);
    document.removeEventListener('keydown', escape);
  };
  watch(open, (isOpen) => {
    stop();
    if (!isOpen) return;
    document.addEventListener('pointerdown', outside);
    document.addEventListener('focusin', outside);
    document.addEventListener('keydown', escape);
  });
  onBeforeUnmount(stop);
}
