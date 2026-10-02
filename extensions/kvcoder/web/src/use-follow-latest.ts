import { nextTick, ref, watch, type Ref } from 'vue';

// The conversation follows its newest content while the person is at the end of it, and stops when they scroll up
// (ADR 0009, 199). "At the end" is within 80 px of it.
const endDistancePx = 80;

export type FollowLatest = {
  /** True while the person has scrolled up, so the view is not following. */
  away: Ref<boolean>;
  onScroll(): void;
  /** Returns to the end and follows again. */
  resume(): void;
};

/** Keeps `list` at its end after each change of `changes`, unless the person scrolled up; `place` changing starts at the end. */
export function useFollowLatest(list: Ref<HTMLElement | null>, changes: () => unknown, place: () => unknown): FollowLatest {
  const away = ref(false);

  function toEnd(): void {
    if (list.value !== null) list.value.scrollTop = list.value.scrollHeight;
  }

  function onScroll(): void {
    const element = list.value;
    if (element !== null) away.value = element.scrollHeight - element.clientHeight - element.scrollTop > endDistancePx;
  }

  function resume(): void {
    away.value = false;
    toEnd();
  }

  watch(changes, async () => {
    if (away.value) return;
    await nextTick();
    toEnd();
  });
  watch(place, async () => {
    away.value = false;
    await nextTick();
    toEnd();
  });
  return { away, onScroll, resume };
}
