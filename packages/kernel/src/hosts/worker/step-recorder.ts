import type { Json } from '@kvman/protocol';
import { ProblemError } from '../../problems.ts';
import type { StepRecorder, StepStart } from '../../store/step-journal.ts';
import type { InvocationValues } from './invocation-values.ts';
import type { RpcClient } from './rpc-client.ts';

function stepStartOf(value: Json | undefined): StepStart {
  if (value === null || typeof value !== 'object' || Array.isArray(value) || value['status'] !== 'recorded') return { status: 'run' };
  return { status: 'recorded', result: value['result'] };
}

// Steps are journaled by the kernel (03 §3.5 `step.begin`, `step.end`); a begin carries the ids and times generated
// since the last journaled write (ADR 0070).
export function stepRecorder(client: RpcClient, invocationId: string, values: InvocationValues): StepRecorder {
  return {
    async begin(step, retrySafe) {
      const result = await client.call(invocationId, { name: 'step.begin', step: step.name, retrySafe, recorded: values.flush() });
      if (!result.ok) throw new ProblemError(result.problem);
      return stepStartOf(result.value);
    },
    async record(step, value) {
      const result = await client.call(invocationId, { name: 'step.end', step: step.name, ...(value === undefined ? {} : { result: value }) });
      if (!result.ok) throw new ProblemError(result.problem);
    },
  };
}
