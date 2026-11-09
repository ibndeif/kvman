import { computed, type ComputedRef } from 'vue';
import { useI18n } from 'vue-i18n';
import { directionOf } from '../../state/appearance.ts';

/** Whether the page reads right to left, following its language as the frame does. */
export function useRightToLeft(): ComputedRef<boolean> {
  const { locale } = useI18n();
  return computed(() => directionOf(locale.value) === 'rtl');
}
