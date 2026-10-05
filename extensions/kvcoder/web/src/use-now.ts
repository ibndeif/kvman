import { onBeforeUnmount, onMounted, ref, type Ref } from 'vue';

/** The page's clock, read again every second while the component is mounted. */
export function useNow(): Ref<number> {
  const now = ref(Date.now());
  let ticker: ReturnType<typeof setInterval> | undefined;
  onMounted(() => (ticker = setInterval(() => (now.value = Date.now()), 1000)));
  onBeforeUnmount(() => clearInterval(ticker));
  return now;
}
