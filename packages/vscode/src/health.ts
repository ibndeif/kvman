import { z } from 'zod';

// Whether a kvman answers on a port (plan 15 §15.5): `kernel.health.get`, called as any local program calls it, with
// the Host `127.0.0.1:<port>` and no Origin (plan 04 §4.2). A kvman that doesn't answer within 2 seconds counts as one
// that doesn't answer (ADR 0101, 9).

const answerSchema = z.object({ ok: z.literal(true) });
export const healthMilliseconds = 2000;

export async function isKvmanAlive(port: number, milliseconds = healthMilliseconds): Promise<boolean> {
  try {
    const response = await fetch(`http://127.0.0.1:${String(port)}/api/queries/kernel.health.get`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ input: {} }),
      signal: AbortSignal.timeout(milliseconds),
    });
    return answerSchema.safeParse(await response.json()).success;
  } catch (error) {
    // fetch reports a port nobody listens on as a TypeError, a body that isn't JSON as a SyntaxError, and the end of its
    // time as a TimeoutError.
    if (error instanceof TypeError || error instanceof SyntaxError || (error instanceof DOMException && error.name === 'TimeoutError')) return false;
    throw error;
  }
}
