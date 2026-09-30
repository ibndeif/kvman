import { z } from '@kvman/sdk';
import { effectSchema, type Effect } from '../../../src/effects/effect-schema.ts';
import { problemOf } from '../api/client.ts';
import { showProblem, type Kvwebui } from './kvwebui.ts';
import { pageLocation } from './navigation.ts';
import { openPanel } from './panels.ts';

// Effects (plan 06 §6.5): when a job the UI started or follows ends, kvwebui takes the job's effects and applies them
// in order.

const effectsSchema = z.array(effectSchema);

async function applyEffect(state: Kvwebui, effect: Effect): Promise<void> {
  if (effect.type === 'toast') state.toasts.show({ text: effect.text, params: effect.params ?? {}, level: effect.level });
  else if (effect.type === 'navigate') await state.router.push(pageLocation(state.registry.value, effect.page, effect.params ?? {}));
  else if (effect.type === 'panel') openPanel(state, effect.panel, effect.open);
  else state.revision.value += 1;
}

export async function applyEffects(state: Kvwebui, jobId: string): Promise<void> {
  const effects = await state.api.command('kvwebui.effect.take', { jobId }).then(
    (ran) => effectsSchema.parse(ran.output),
    (error: unknown) => {
      showProblem(state, problemOf(error));
      return [];
    },
  );
  for (const effect of effects) await applyEffect(state, effect);
}
