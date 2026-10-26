import { z } from 'zod';

// Whether a kvman answers on a port, and its version (plan 15 §15.3 and §15.5, ADR 0106, 5): `kernel.health.get`,
// called as any local program calls it, with the Host `127.0.0.1:<port>` and no Origin (plan 04 §4.2). A kvman that
// doesn't answer within 2 seconds counts as one that doesn't answer (ADR 0101, 9).

const answerSchema = z.object({ ok: z.literal(true), output: z.object({ version: z.string().optional() }).optional() });
export const healthMilliseconds = 2000;

/** What a running kvman says of itself: `answered` false when nothing answered in time. */
export type KvmanAnswer = { answered: false } | { answered: true; version: string | undefined };

export async function askKvman(port: number, milliseconds = healthMilliseconds): Promise<KvmanAnswer> {
  try {
    const response = await fetch(`http://127.0.0.1:${String(port)}/api/queries/kernel.health.get`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ input: {} }),
      signal: AbortSignal.timeout(milliseconds),
    });
    const answer = answerSchema.safeParse(await response.json());
    return answer.success ? { answered: true, version: answer.data.output?.version } : { answered: false };
  } catch (error) {
    // fetch reports a port nobody listens on as a TypeError, a body that isn't JSON as a SyntaxError, and the end of its
    // time as a TimeoutError.
    if (error instanceof TypeError || error instanceof SyntaxError || (error instanceof DOMException && error.name === 'TimeoutError')) return { answered: false };
    throw error;
  }
}

export async function isKvmanAlive(port: number, milliseconds = healthMilliseconds): Promise<boolean> {
  return (await askKvman(port, milliseconds)).answered;
}
