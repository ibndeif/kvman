import type { Kvman } from '@kvman/sdk/web';
import { toastProblem } from './kvman.ts';

/** Makes `modelId` the default model, so a new chat starts with it (ADR 0009, 205); a failure is a toast and never undoes the pick. */
export async function rememberModel(kvman: Kvman, modelId: string): Promise<void> {
  try {
    await kvman.exec('kernel.settings.set', { key: 'kvai.defaultModel', value: modelId, scope: 'global' });
    kvman.refresh();
  } catch (error) {
    toastProblem(kvman, error);
  }
}
