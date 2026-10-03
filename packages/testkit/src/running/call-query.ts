import { envelopeSchema, ProblemError, z, type Json } from '@kvman/sdk';
import { KvmanUnreachableError, type RunningKvman } from './running-kvman.ts';

// Calling the running kvman (plan 04 §4.1–4.2): `POST /api/queries/<name>` with `{ input }` and no `Origin` header,
// answered with the envelope. A refused connection means it isn't running.

function isConnectionRefused(error: unknown): boolean {
  let current: unknown = error;
  while (current instanceof Error) {
    if ('code' in current && current.code === 'ECONNREFUSED') return true;
    current = current.cause;
  }
  return false;
}

/** Calls a public query on the running kvman and returns its validated output. */
export async function callQuery<Output>(running: RunningKvman, name: string, input: Json, outputSchema: z.ZodType<Output>): Promise<Output> {
  let response: Response;
  try {
    response = await fetch(`${running.baseUrl}/api/queries/${name}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ input }),
    });
  } catch (error) {
    if (isConnectionRefused(error)) throw new KvmanUnreachableError(`The kvman at ${running.baseUrl} refused the connection.`);
    throw error;
  }
  const answer = envelopeSchema({ output: outputSchema, jobId: z.string() }).parse(await response.json());
  if (!answer.ok) throw new ProblemError(answer.problem);
  return answer.output;
}
