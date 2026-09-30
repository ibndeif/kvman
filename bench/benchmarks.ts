import type { Metrics, Target } from './rules.ts';
import { storeFind } from './store-find.ts';

// Each benchmark is added by the milestone that builds the part it measures (plan 12 §12.3).

export type Benchmark = {
  name: string;
  targets: Record<string, Target>;
  measure: () => Promise<Metrics>;
};

export const benchmarks: readonly Benchmark[] = [storeFind];
